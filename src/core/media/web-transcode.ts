import { spawn, type ChildProcess } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdir, rename, rm, stat, writeFile } from 'node:fs/promises'
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
    const existingJob = this.jobs.get(input.id)
    if (existingJob) return this.toStatus(existingJob)

    const entry = await this.getCacheEntry(input)
    if (await isFile(entry.outputPath)) {
      return { state: 'ready', progress: 1, outputBytes: await this.getFileSize(entry.outputPath), message: null, outputPath: entry.outputPath }
    }
    return { state: 'idle', progress: null, outputBytes: 0, message: null, outputPath: null }
  }

  async start(input: WebTranscodeInput): Promise<WebTranscodeJobStatus> {
    const existingJob = this.jobs.get(input.id)
    if (existingJob && (existingJob.state === 'queued' || existingJob.state === 'running')) return this.toStatus(existingJob)
    if (existingJob?.state === 'ready') return this.toStatus(existingJob)

    const entry = await this.getCacheEntry(input)
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
      this.jobs.set(input.id, readyJob)
      return this.toStatus(readyJob)
    }

    await mkdir(this.options.cacheRoot, { recursive: true })
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
    this.jobs.set(input.id, job)
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
