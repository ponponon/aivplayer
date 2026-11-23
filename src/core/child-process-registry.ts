import { execFile, spawn, type ChildProcess, type ChildProcessByStdio, type ExecFileOptions, type SpawnOptions } from 'node:child_process'
import type { Readable } from 'node:stream'

/**
 * Every long-running external tool (FFmpeg, FFprobe, Whisper, ...) started by the
 * main process registers here so it can be reported and, more importantly, killed
 * when the app quits. Without this registry an FFmpeg child is re-parented to init
 * and keeps burning CPU after the window is gone.
 */
export type ChildProcessRole = 'analysis' | 'preview' | 'probe' | 'export' | 'helper'

export type ChildProcessMeta = {
  /** Short label used in shutdown logs and diagnostics. */
  label: string
  /** Rough purpose; analysis children are the safest to interrupt. */
  role?: ChildProcessRole
}

export type TrackedChildProcessSnapshot = {
  pid: number
  label: string
  role: ChildProcessRole
  command: string
  ageMs: number
}

type TrackedChildProcess = {
  child: ChildProcess
  pid: number
  label: string
  role: ChildProcessRole
  command: string
  startedAt: number
}

const DEFAULT_TERMINATE_GRACE_MS = 1_200
const tracked = new Map<number, TrackedChildProcess>()

function isRunning(child: ChildProcess): boolean {
  return child.exitCode === null && child.signalCode === null
}

function describeCommand(file: string, args: readonly string[]): string {
  const line = [file, ...args].join(' ')
  return line.length > 240 ? `${line.slice(0, 237)}...` : line
}

function sendSignal(entry: TrackedChildProcess, signal: NodeJS.Signals): void {
  if (!isRunning(entry.child)) return
  try {
    // POSIX: SIGTERM lets FFmpeg flush its trailer. Windows maps every signal to
    // TerminateProcess, which is still enough because FFmpeg spawns no children.
    entry.child.kill(signal)
  } catch {
    // The child may have exited between the liveness check and the signal.
  }
}

function waitForExit(entry: TrackedChildProcess): Promise<void> {
  if (!isRunning(entry.child)) return Promise.resolve()
  return new Promise((resolve) => {
    const finish = (): void => resolve()
    entry.child.once('exit', finish)
    entry.child.once('error', finish)
  })
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds).unref())
}

/** Registers a child process so quit-time cleanup can reach it. Safe to call twice for the same pid. */
export function trackChildProcess(child: ChildProcess, meta: ChildProcessMeta, command = ''): void {
  const pid = child.pid
  if (typeof pid !== 'number' || tracked.has(pid)) return
  const entry: TrackedChildProcess = {
    child,
    pid,
    label: meta.label,
    role: meta.role ?? 'analysis',
    command,
    startedAt: Date.now()
  }
  tracked.set(pid, entry)
  const release = (): void => {
    if (tracked.get(pid) === entry) tracked.delete(pid)
  }
  child.once('exit', release)
  child.once('close', release)
  child.once('error', release)
}

/** Snapshot of live children, ordered by start time. Used by diagnostics and the quit log. */
export function listTrackedChildProcesses(): TrackedChildProcessSnapshot[] {
  const now = Date.now()
  return Array.from(tracked.values())
    .sort((left, right) => left.startedAt - right.startedAt)
    .map((entry) => ({ pid: entry.pid, label: entry.label, role: entry.role, command: entry.command, ageMs: now - entry.startedAt }))
}

export function countTrackedChildProcesses(): number {
  return tracked.size
}

/**
 * Terminates every registered child: SIGTERM first, then SIGKILL for whatever is
 * still alive after the grace window. Resolves with how many were hit.
 */
export async function terminateTrackedChildProcesses(options: { graceMs?: number } = {}): Promise<{ terminated: number; forced: number }> {
  const entries = Array.from(tracked.values()).filter((entry) => isRunning(entry.child))
  if (entries.length === 0) return { terminated: 0, forced: 0 }
  for (const entry of entries) sendSignal(entry, 'SIGTERM')
  await Promise.race([Promise.all(entries.map(waitForExit)), delay(options.graceMs ?? DEFAULT_TERMINATE_GRACE_MS)])
  let forced = 0
  for (const entry of entries) {
    if (!isRunning(entry.child)) continue
    sendSignal(entry, 'SIGKILL')
    forced += 1
  }
  console.warn(`[child-processes] 退出清理：结束 ${entries.length} 个外部进程（强制 ${forced}）`)
  // Only drop what we signalled: a child spawned while we waited stays registered so
  // the `process.on('exit')` hook can still reap it.
  for (const entry of entries) tracked.delete(entry.pid)
  return { terminated: entries.length, forced }
}

/** Last-resort synchronous SIGKILL, only usable from `process.on('exit')`. */
export function terminateTrackedChildProcessesSync(): number {
  let killed = 0
  for (const entry of tracked.values()) {
    if (!isRunning(entry.child)) continue
    sendSignal(entry, 'SIGKILL')
    killed += 1
  }
  tracked.clear()
  return killed
}

function runExecFile(file: string, args: readonly string[], options: ExecFileOptions, meta: ChildProcessMeta): Promise<{ stdout: unknown; stderr: unknown }> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, [...args], options, (error, stdout, stderr) => {
      if (error) {
        // Node does not attach captured output to execFile failures; callers that
        // surface FFmpeg's last error line depend on these fields.
        const failure = error as Error & { stdout?: unknown; stderr?: unknown }
        failure.stdout ??= stdout
        failure.stderr ??= stderr
        reject(failure)
        return
      }
      resolve({ stdout, stderr })
    })
    trackChildProcess(child, meta, describeCommand(file, args))
  })
}

/** Tracked `execFile` for textual output. `error.stdout` / `error.stderr` still work on failure. */
export async function execFileText(file: string, args: readonly string[], meta: ChildProcessMeta, options: Omit<ExecFileOptions, 'encoding'> = {}): Promise<{ stdout: string; stderr: string }> {
  const result = await runExecFile(file, args, { ...options, encoding: 'utf8' }, meta)
  return { stdout: String(result.stdout ?? ''), stderr: String(result.stderr ?? '') }
}

/** Tracked `execFile` for binary output (frames, waveforms) read from stdout. */
export async function execFileBuffer(file: string, args: readonly string[], meta: ChildProcessMeta, options: Omit<ExecFileOptions, 'encoding'> = {}): Promise<{ stdout: Buffer; stderr: Buffer }> {
  const result = await runExecFile(file, args, { ...options, encoding: 'buffer' }, meta)
  return { stdout: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(String(result.stdout ?? '')), stderr: Buffer.isBuffer(result.stderr) ? result.stderr : Buffer.from(String(result.stderr ?? '')) }
}

/** Tracked `spawn` for long-running jobs that stream progress instead of buffering output. */
export function spawnTracked(file: string, args: readonly string[], meta: ChildProcessMeta, options: SpawnOptions & { stdio: ['ignore', 'pipe', 'pipe'] }): ChildProcessByStdio<null, Readable, Readable>
export function spawnTracked(file: string, args: readonly string[], meta: ChildProcessMeta, options: SpawnOptions & { stdio: ['ignore', 'ignore', 'pipe'] }): ChildProcessByStdio<null, null, Readable>
export function spawnTracked(file: string, args: readonly string[], meta: ChildProcessMeta, options?: SpawnOptions): ChildProcess
export function spawnTracked(file: string, args: readonly string[], meta: ChildProcessMeta, options: SpawnOptions = {}): ChildProcess {
  const child = spawn(file, [...args], options)
  trackChildProcess(child, meta, describeCommand(file, args))
  return child
}

// A crash-free quit reaches `before-quit` and awaits the registry. This hook is the
// safety net for every other exit path, including `app.exit()` and fatal errors.
process.on('exit', () => {
  const killed = terminateTrackedChildProcessesSync()
  if (killed > 0) console.warn(`[child-processes] 进程退出时强制结束 ${killed} 个外部进程`)
})
