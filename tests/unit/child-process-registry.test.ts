import { readFileSync } from 'node:fs'
import type { ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { countTrackedChildProcesses, execFileText, listTrackedChildProcesses, spawnTracked, terminateTrackedChildProcesses, terminateTrackedChildProcessesSync } from '../../src/core/child-process-registry'

const projectRoot = process.cwd()
const readSource = (path: string): string => readFileSync(join(projectRoot, path), 'utf8')
const SLEEP_SCRIPT = 'setTimeout(() => {}, 60000)'
const RUNTIME_CHILD_PROCESS_IMPORT = /import \{(?:[^}]*\b)?(?:execFile|spawn|exec)\b[^}]*\} from 'node:child_process'/u

function spawnSleeper(): ChildProcess {
  return spawnTracked(process.execPath, ['-e', SLEEP_SCRIPT], { label: 'test-sleeper', role: 'analysis' }, { stdio: 'ignore' })
}

function waitForClose(child: ChildProcess): Promise<void> {
  return new Promise((resolve) => { child.once('close', () => resolve()) })
}

describe('child process registry', () => {
  it('registers spawned children and reports them in the snapshot', async () => {
    const child = spawnSleeper()
    const snapshot = listTrackedChildProcesses()
    expect(snapshot.some((entry) => entry.label === 'test-sleeper' && entry.pid === child.pid)).toBe(true)
    expect(countTrackedChildProcesses()).toBeGreaterThan(0)
    await terminateTrackedChildProcesses({ graceMs: 200 })
    expect(countTrackedChildProcesses()).toBe(0)
  })

  it('terminates every registered child on shutdown', async () => {
    const child = spawnSleeper()
    const exited = waitForClose(child)
    const result = await terminateTrackedChildProcesses({ graceMs: 200 })
    await exited
    expect(result.terminated).toBeGreaterThan(0)
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
  })

  it('force kills survivors synchronously for the process exit hook', async () => {
    const child = spawnSleeper()
    const exited = waitForClose(child)
    expect(terminateTrackedChildProcessesSync()).toBeGreaterThan(0)
    await exited
    expect(child.exitCode !== null || child.signalCode !== null).toBe(true)
    expect(countTrackedChildProcesses()).toBe(0)
  })

  it('drops a child from the registry when it exits on its own', async () => {
    const child = spawnTracked(process.execPath, ['-e', 'process.exit(0)'], { label: 'test-short', role: 'probe' }, { stdio: 'ignore' })
    await waitForClose(child)
    expect(listTrackedChildProcesses().some((entry) => entry.pid === child.pid)).toBe(false)
  })

  it('keeps execFile semantics for stdout and stderr', async () => {
    const ok = await execFileText(process.execPath, ['-e', "process.stdout.write('hello')"], { label: 'test-exec', role: 'probe' })
    expect(ok.stdout).toBe('hello')
    await expect(execFileText(process.execPath, ['-e', "process.stderr.write('boom'); process.exit(1)"], { label: 'test-exec', role: 'probe' })).rejects.toMatchObject({ stderr: 'boom' })
  })
})

describe('child process registry wiring', () => {
  it('kills tracked children from before-quit', () => {
    expect(readSource('src/desktop/index.ts')).toContain('terminateTrackedChildProcesses()')
  })

  it('routes every media pipeline command through the registry', () => {
    const migrated = [
      'src/desktop/ipc-filmstrip.ts',
      'src/desktop/ipc-waveform.ts',
      'src/desktop/ipc-silence-detection.ts',
      'src/desktop/ipc-structure-analysis.ts',
      'src/desktop/ipc-speaker-diarization.ts',
      'src/desktop/web/web-server.ts',
      'src/core/media/scene-detection-runtime.ts',
      'src/core/media/media-metadata.ts',
      'src/core/media/web-transcode.ts',
      'src/core/media/timeline-export.ts',
      'src/core/media/clip-export.ts',
      'src/core/ai/asr-subtitle-job.ts'
    ]
    for (const file of migrated) {
      const source = readSource(file)
      // Type-only imports of ChildProcess are fine; direct execFile/spawn calls are not.
      expect(source).not.toMatch(RUNTIME_CHILD_PROCESS_IMPORT)
      expect(source).toMatch(/child-process-registry/u)
    }
  })
})
