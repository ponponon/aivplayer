import type { VisionIndexOptions, VisionIndexProgress } from '../../shared/vision-types'

export type VisionIndexRunner = (
  mediaPaths: string[],
  intervalSeconds: number | undefined,
  signal: AbortSignal,
  onProgress: (progress: VisionIndexProgress) => void,
  options?: VisionIndexOptions
) => Promise<VisionIndexProgress>

type VisionIndexQueueJob = {
  mediaPaths: string[]
  intervalSeconds: number | undefined
  onProgress: (progress: VisionIndexProgress) => void
  options: VisionIndexOptions | undefined
}

export class VisionIndexQueue {
  private readonly runner: VisionIndexRunner
  private readonly pendingJobs: VisionIndexQueueJob[] = []
  private readonly queuedPaths = new Set<string>()
  private activeController: AbortController | null = null
  private drainPromise: Promise<void> | null = null

  constructor(runner: VisionIndexRunner) {
    this.runner = runner
  }

  enqueue(mediaPaths: string[], intervalSeconds: number | undefined, onProgress: (progress: VisionIndexProgress) => void, options?: VisionIndexOptions): void {
    const uniquePaths = [...new Set(mediaPaths.map((mediaPath) => mediaPath.trim()).filter((mediaPath) => mediaPath && !this.queuedPaths.has(mediaPath)))]
    if (uniquePaths.length === 0) return
    uniquePaths.forEach((mediaPath) => this.queuedPaths.add(mediaPath))
    this.pendingJobs.push({ mediaPaths: uniquePaths, intervalSeconds, onProgress, options })
    if (!this.drainPromise) this.drainPromise = this.drain().finally(() => { this.drainPromise = null })
  }

  cancel(): boolean {
    const hadWork = this.pendingJobs.length > 0 || this.activeController !== null
    this.pendingJobs.length = 0
    this.queuedPaths.clear()
    this.activeController?.abort()
    return hadWork
  }

  get isRunning(): boolean {
    return this.activeController !== null || this.pendingJobs.length > 0
  }

  private async drain(): Promise<void> {
    while (this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift()
      if (!job) continue
      job.mediaPaths.forEach((mediaPath) => this.queuedPaths.delete(mediaPath))
      const controller = new AbortController()
      this.activeController = controller
      try {
        await this.runner(job.mediaPaths, job.intervalSeconds, controller.signal, job.onProgress, job.options)
      } catch {
        // VisionLibrary emits an error progress before throwing. The queue must
        // stay alive so a later playlist change can schedule another attempt.
      } finally {
        if (this.activeController === controller) this.activeController = null
      }
    }
  }
}
