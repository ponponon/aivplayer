import type { VisionIndexOptions, VisionIndexProgress } from '../../shared/vision-types'

export type VisionIndexCoordinatorRunner = (
  mediaPaths: string[],
  intervalSeconds: number | undefined,
  signal: AbortSignal,
  onProgress: (progress: VisionIndexProgress) => void,
  options?: VisionIndexOptions
) => Promise<VisionIndexProgress>

type VisionIndexCoordinatorJob = {
  mediaPaths: string[]
  intervalSeconds: number | undefined
  signal: AbortSignal
  onProgress: (progress: VisionIndexProgress) => void
  options: VisionIndexOptions | undefined
  resolve: (progress: VisionIndexProgress) => void
  reject: (error: unknown) => void
  onAbort: () => void
  cleanup: () => void
}

type ActiveVisionIndexJob = {
  job: VisionIndexCoordinatorJob
  controller: AbortController
}

export function createVisionIndexAbortError(): Error {
  const error = new Error('视觉索引已取消')
  error.name = 'AbortError'
  return error
}

export class VisionIndexCoordinator {
  private readonly runner: VisionIndexCoordinatorRunner
  private readonly pendingJobs: VisionIndexCoordinatorJob[] = []
  private activeJob: ActiveVisionIndexJob | null = null
  private drainPromise: Promise<void> | null = null

  constructor(runner: VisionIndexCoordinatorRunner) {
    this.runner = runner
  }

  run(
    mediaPaths: string[],
    intervalSeconds: number | undefined,
    signal: AbortSignal,
    onProgress: (progress: VisionIndexProgress) => void,
    options?: VisionIndexOptions
  ): Promise<VisionIndexProgress> {
    if (signal.aborted) return Promise.reject(createVisionIndexAbortError())
    return new Promise<VisionIndexProgress>((resolve, reject) => {
      const job = {} as VisionIndexCoordinatorJob
      const removePendingJob = (): void => {
        const index = this.pendingJobs.indexOf(job)
        if (index >= 0) this.pendingJobs.splice(index, 1)
      }
      const onAbort = (): void => {
        if (this.activeJob?.job === job) {
          this.activeJob.controller.abort()
        } else {
          removePendingJob()
          job.cleanup()
          reject(createVisionIndexAbortError())
        }
      }
      job.mediaPaths = mediaPaths
      job.intervalSeconds = intervalSeconds
      job.signal = signal
      job.onProgress = onProgress
      job.options = options
      job.resolve = resolve
      job.reject = reject
      job.onAbort = onAbort
      job.cleanup = () => signal.removeEventListener('abort', onAbort)
      signal.addEventListener('abort', onAbort, { once: true })
      this.pendingJobs.push(job)
      this.startDrain()
    })
  }

  cancel(): boolean {
    const hadWork = this.pendingJobs.length > 0 || this.activeJob !== null
    const pendingJobs = this.pendingJobs.splice(0)
    for (const job of pendingJobs) {
      job.cleanup()
      job.reject(createVisionIndexAbortError())
    }
    this.activeJob?.controller.abort()
    return hadWork
  }

  get isRunning(): boolean {
    return this.pendingJobs.length > 0 || this.activeJob !== null
  }

  private startDrain(): void {
    if (this.drainPromise) return
    this.drainPromise = this.drain().finally(() => { this.drainPromise = null })
  }

  private async drain(): Promise<void> {
    while (this.pendingJobs.length > 0) {
      const job = this.pendingJobs.shift()
      if (!job) continue
      if (job.signal.aborted) {
        job.cleanup()
        job.reject(createVisionIndexAbortError())
        continue
      }

      const controller = new AbortController()
      this.activeJob = { job, controller }
      try {
        const progress = await this.runner(job.mediaPaths, job.intervalSeconds, controller.signal, job.onProgress, job.options)
        if (controller.signal.aborted) job.reject(createVisionIndexAbortError())
        else job.resolve(progress)
      } catch (error) {
        job.reject(error)
      } finally {
        job.cleanup()
        if (this.activeJob?.job === job) this.activeJob = null
      }
    }
  }
}
