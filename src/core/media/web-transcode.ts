import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, readdir, rename, rm, stat, statfs, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export type WebTranscodeInput = {
  id: string
  sourcePath: string
  durationSeconds: number | null
}

export type WebTranscodeJobState = 'idle' | 'queued' | 'running' | 'ready' | 'error'

export type WebTranscodeJobStatus = {
  state: WebTranscodeJobState
  progress: number | null
  outputBytes: number
  message: string | null
  outputPath: string | null
}

type WebTranscodeManagerOptions = {
  cacheRoot: string
  getFfmpegPath: () => Promise<string | null>
  minFreeBytes?: number
  maxCacheBytes?: number
  maxCacheAgeMs?: number
  getAvailableBytes?: (directoryPath: string) => Promise<number>
}

type CacheEntry = {
  outputPath: string
  partialPath: string
  metadataPath: string
}

type WebTranscodeJob = {
  input: WebTranscodeInput
  entry: CacheEntry
  state: WebTranscodeJobState
  progress: number | null
  message: string | null
  outputBytes: number
  child: ChildProcess | null
  stderrBuffer: string
  done: Promise<void> | null
}

const TRANSCODE_PROFILE_VERSION = 'web-mp4-h264-aac-v1'
const DEFAULT_MIN_FREE_BYTES = 256 * 1024 * 1024
const DEFAULT_MAX_CACHE_BYTES = 20 * 1024 * 1024 * 1024
const DEFAULT_MAX_CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1000

function isCompleteProgress(progress: number | null): number | null {
  if (progress == null || !Number.isFinite(progress)) return null
  return Math.min(1, Math.max(0, progress))
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile()
  } catch {
    return false
  }
}

export class WebTranscodeManager {
  private readonly options: WebTranscodeManagerOptions
  private readonly jobs = new Map<string, WebTranscodeJob>()

  constructor(options: WebTranscodeManagerOptions) {
    this.options = options
  }

  async getStatus(input: WebTranscodeInput): Promise<WebTranscodeJobStatus> {
    const entry = await this.getCacheEntry(input)
    const existingJob = this.jobs.get(entry.outputPath)
    if (existingJob) return this.toStatus(existingJob)

    if (await isFile(entry.outputPath)) {
      return { state: 'ready', progress: 1, outputBytes: await this.getFileSize(entry.outputPath), message: null, outputPath: entry.outputPath }
    }
    return { state: 'idle', progress: null, outputBytes: 0, message: null, outputPath: null }
  }

  async start(input: WebTranscodeInput): Promise<WebTranscodeJobStatus> {
    const entry = await this.getCacheEntry(input)
    const existingJob = this.jobs.get(entry.outputPath)
    if (existingJob && (existingJob.state === 'queued' || existingJob.state === 'running')) return this.toStatus(existingJob)
    if (existingJob?.state === 'ready') return this.toStatus(existingJob)

    if (await isFile(entry.outputPath)) {
      const readyJob: WebTranscodeJob = {
        input,
        entry,
        state: 'ready',
        progress: 1,
        message: null,
        outputBytes: await this.getFileSize(entry.outputPath),
        child: null,
        stderrBuffer: '',
        done: null
      }
      this.jobs.set(entry.outputPath, readyJob)
      return this.toStatus(readyJob)
    }

    await mkdir(this.options.cacheRoot, { recursive: true })
    await this.pruneCache()
    await this.assertSufficientDiskSpace(input)
    await rm(entry.partialPath, { force: true })
    const job: WebTranscodeJob = {
      input,
      entry,
      state: 'queued',
      progress: 0,
      message: null,
      outputBytes: 0,
      child: null,
      stderrBuffer: '',
      done: null
    }
    this.jobs.set(entry.outputPath, job)
    job.done = this.run(job)
    return this.toStatus(job)
  }

  async stop(): Promise<void> {
    const jobs = [...this.jobs.values()]
    for (const job of jobs) {
      if (job.child && !job.child.killed) job.child.kill()
    }
    await Promise.allSettled(jobs.map((job) => job.done).filter((done): done is Promise<void> => Boolean(done)))
    await Promise.all(jobs.map((job) => rm(job.entry.partialPath, { force: true }).catch(() => undefined)))
    this.jobs.clear()
  }

  async getReadyOutputPath(input: WebTranscodeInput): Promise<string | null> {
    const status = await this.getStatus(input)
    return status.state === 'ready' ? status.outputPath : null
  }

  private async getCacheEntry(input: WebTranscodeInput): Promise<CacheEntry> {
    const sourceStat = await stat(input.sourcePath)
    const cacheKey = createHash('sha256')
      .update(JSON.stringify({ profile: TRANSCODE_PROFILE_VERSION, sourcePath: input.sourcePath, size: sourceStat.size, modifiedAt: sourceStat.mtimeMs }))
      .digest('hex')
    return {
      outputPath: join(this.options.cacheRoot, `${cacheKey}.mp4`),
      partialPath: join(this.options.cacheRoot, `${cacheKey}.part.mp4`),
      metadataPath: join(this.options.cacheRoot, `${cacheKey}.json`)
    }
  }

  private toStatus(job: WebTranscodeJob): WebTranscodeJobStatus {
    return {
      state: job.state,
      progress: isCompleteProgress(job.progress),
      outputBytes: job.outputBytes,
      message: job.message,
      outputPath: job.state === 'ready' ? job.entry.outputPath : null
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      return (await stat(filePath)).size
    } catch {
      return 0
    }
  }

  private async assertSufficientDiskSpace(input: WebTranscodeInput): Promise<void> {
    const sourceSize = (await stat(input.sourcePath)).size
    const getAvailableBytes = this.options.getAvailableBytes ?? (async (directoryPath: string): Promise<number> => {
      const filesystem = await statfs(directoryPath)
      return Number(filesystem.bavail) * Number(filesystem.bsize)
    })
    let availableBytes: number
    try {
      availableBytes = await getAvailableBytes(this.options.cacheRoot)
    } catch {
      // Some mounted or older filesystems may not expose statfs details. The
      // transcode itself still reports a normal FFmpeg error if writing fails.
      return
    }
    const minimumFreeBytes = this.options.minFreeBytes ?? DEFAULT_MIN_FREE_BYTES
    const requiredBytes = sourceSize + minimumFreeBytes
    if (availableBytes < requiredBytes) {
      throw new Error(`磁盘空间不足：转码至少需要约 ${this.formatBytes(requiredBytes)} 可用空间，当前约 ${this.formatBytes(availableBytes)}`)
    }
  }

  private async pruneCache(): Promise<void> {
    const maxCacheBytes = this.options.maxCacheBytes ?? DEFAULT_MAX_CACHE_BYTES
    const maxCacheAgeMs = this.options.maxCacheAgeMs ?? DEFAULT_MAX_CACHE_AGE_MS
    const activePaths = new Set([...this.jobs.values()].flatMap((job) => [job.entry.outputPath, job.entry.partialPath, job.entry.metadataPath]))
    let entries
    try {
      entries = await readdir(this.options.cacheRoot, { withFileTypes: true })
    } catch {
      return
    }

    const cacheFiles: Array<{ path: string; metadataPath: string; size: number; modifiedAt: number }> = []
    const partialFiles: Array<{ path: string; modifiedAt: number }> = []
    for (const directoryEntry of entries) {
      if (!directoryEntry.isFile()) continue
      if (directoryEntry.name.endsWith('.part.mp4')) {
        const partialPath = join(this.options.cacheRoot, directoryEntry.name)
        if (activePaths.has(partialPath)) continue
        try {
          partialFiles.push({ path: partialPath, modifiedAt: (await stat(partialPath)).mtimeMs })
        } catch {
          // The file may disappear between readdir and stat.
        }
        continue
      }
      if (!directoryEntry.name.endsWith('.mp4')) continue
      const outputPath = join(this.options.cacheRoot, directoryEntry.name)
      if (activePaths.has(outputPath)) continue
      try {
        const fileStat = await stat(outputPath)
        cacheFiles.push({
          path: outputPath,
          metadataPath: outputPath.slice(0, -'.mp4'.length) + '.json',
          size: fileStat.size,
          modifiedAt: fileStat.mtimeMs
        })
      } catch {
        continue
      }
    }

    const removeCacheFile = async (cacheFile: { path: string; metadataPath: string }): Promise<void> => {
      await Promise.all([
        rm(cacheFile.path, { force: true }),
        rm(cacheFile.metadataPath, { force: true }),
        rm(`${cacheFile.path.slice(0, -'.mp4'.length)}.part.mp4`, { force: true })
      ])
    }

    const staleBefore = Date.now() - maxCacheAgeMs
    await Promise.all(partialFiles.filter((candidate) => candidate.modifiedAt < staleBefore).map((candidate) => rm(candidate.path, { force: true })))
    for (const cacheFile of cacheFiles.filter((candidate) => candidate.modifiedAt < staleBefore)) {
      await removeCacheFile(cacheFile)
    }

    const retainedFiles = cacheFiles
      .filter((candidate) => candidate.modifiedAt >= staleBefore)
      .sort((left, right) => left.modifiedAt - right.modifiedAt)
    let totalBytes = retainedFiles.reduce((total, cacheFile) => total + cacheFile.size, 0)
    for (const cacheFile of retainedFiles) {
      if (totalBytes <= maxCacheBytes) break
      await removeCacheFile(cacheFile)
      totalBytes -= cacheFile.size
    }
  }

  private formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 1024) return `${Math.max(0, Math.round(bytes))} B`
    const units = ['KB', 'MB', 'GB', 'TB']
    let value = bytes
    let unitIndex = -1
    do {
      value /= 1024
      unitIndex += 1
    } while (value >= 1024 && unitIndex < units.length - 1)
    return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[unitIndex]}`
  }

  private async run(job: WebTranscodeJob): Promise<void> {
    let ffmpegPath: string | null = null
    try {
      ffmpegPath = await this.options.getFfmpegPath()
    } catch (error) {
      job.state = 'error'
      job.message = error instanceof Error ? error.message : String(error)
      return
    }
    if (!ffmpegPath) {
      job.state = 'error'
      job.message = '未找到 FFmpeg，无法为浏览器转码'
      return
    }

    job.state = 'running'
    const args = [
      '-hide_banner',
      '-loglevel', 'error',
      '-nostdin',
      '-y',
      '-i', job.input.sourcePath,
      '-map', '0:v:0?',
      '-map', '0:a:0?',
      '-sn',
      '-c:v', 'libx264',
      '-preset', 'veryfast',
      '-crf', '23',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-b:a', '160k',
      '-ac', '2',
      '-movflags', '+faststart',
      '-progress', 'pipe:2',
      job.entry.partialPath
    ]

    try {
      const child = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
      job.child = child
      if (!child.stderr) throw new Error('无法读取 FFmpeg 转码进度')
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => this.readProgress(job, chunk))
      const exitCode = await new Promise<number>((resolvePromise, rejectPromise) => {
        child.once('error', rejectPromise)
        child.once('close', (code) => resolvePromise(code ?? 1))
      })
      job.child = null
      if (exitCode !== 0) {
        job.state = 'error'
        job.message = this.getLastErrorLine(job.stderrBuffer) ?? `FFmpeg 转码失败（退出码 ${exitCode}）`
        await rm(job.entry.partialPath, { force: true })
        return
      }
      await rename(job.entry.partialPath, job.entry.outputPath)
      job.outputBytes = await this.getFileSize(job.entry.outputPath)
      await this.writeMetadata(job)
      job.progress = 1
      job.state = 'ready'
      job.message = null
    } catch (error) {
      job.child = null
      job.state = 'error'
      job.message = error instanceof Error ? error.message : String(error)
      await rm(job.entry.partialPath, { force: true })
    }
  }

  private readProgress(job: WebTranscodeJob, chunk: string): void {
    job.stderrBuffer = `${job.stderrBuffer}${chunk}`.slice(-32 * 1024)
    const lines = job.stderrBuffer.split(/\r?\n/u)
    job.stderrBuffer = lines.pop() ?? ''
    for (const line of lines) {
      const separatorIndex = line.indexOf('=')
      if (separatorIndex < 0) continue
      const key = line.slice(0, separatorIndex)
      const value = line.slice(separatorIndex + 1)
      if (key === 'out_time_ms') {
        const outputTimeSeconds = Number(value) / 1_000_000
        if (job.input.durationSeconds && Number.isFinite(outputTimeSeconds)) job.progress = isCompleteProgress(outputTimeSeconds / job.input.durationSeconds)
      }
    }
  }

  private getLastErrorLine(stderr: string): string | null {
    return stderr.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).at(-1) ?? null
  }

  private async writeMetadata(job: WebTranscodeJob): Promise<void> {
    // The metadata sidecar is intentionally best-effort. It makes future cache
    // inspection possible without changing playback correctness today.
    await writeFile(job.entry.metadataPath, JSON.stringify({ profile: TRANSCODE_PROFILE_VERSION, sourcePath: job.input.sourcePath, outputPath: job.entry.outputPath }), 'utf8').catch(() => undefined)
  }
}
