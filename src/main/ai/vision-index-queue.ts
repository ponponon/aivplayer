import type { VisionIndexProgress } from '../../shared/vision-types'

export type VisionIndexRunner = (
  mediaPaths: string[],
  intervalSeconds: number | undefined,
  signal: AbortSignal,
  onProgress: (progress: VisionIndexProgress) => void
) => Promise<VisionIndexProgress>

export class VisionIndexQueue {
  private readonly runner: VisionIndexRunner
  private readonly pendingPaths = new Set<string>()
  private activeController: AbortController | null = null
  private drainPromise: Promise<void> | null = null
  private intervalSeconds: number | undefined
  private onProgress: ((progress: VisionIndexProgress) => void) | null = null

  constructor(runner: VisionIndexRunner) {
    this.runner = runner
  }

  enqueue(mediaPaths: string[], intervalSeconds: number | undefined, onProgress: (progress: VisionIndexProgress) => void): void {
    for (const mediaPath of mediaPaths) {
      if (mediaPath.trim()) this.pendingPaths.add(mediaPath)
    }
    this.intervalSeconds = intervalSeconds
    this.onProgress = onProgress
    if (!this.drainPromise && this.pendingPaths.size > 0) {
      this.drainPromise = this.drain().finally(() => { this.drainPromise = null })
    }
  }

  cancel(): boolean {
    const hadWork = this.pendingPaths.size > 0 || this.activeController !== null
    this.pendingPaths.clear()
    this.activeController?.abort()
    return hadWork
  }

  get isRunning(): boolean {
    return this.activeController !== null || this.pendingPaths.size > 0
  }

  private async drain(): Promise<void> {
    while (this.pendingPaths.size > 0) {
      const mediaPaths = [...this.pendingPaths]
      this.pendingPaths.clear()
      const controller = new AbortController()
      this.activeController = controller
      try {
        await this.runner(mediaPaths, this.intervalSeconds, controller.signal, (progress) => this.onProgress?.(progress))
      } catch {
        // VisionLibrary emits an error progress before throwing. The queue must
        // stay alive so a later playlist change can schedule another attempt.
      } finally {
        if (this.activeController === controller) this.activeController = null
      }
    }
  }
}
