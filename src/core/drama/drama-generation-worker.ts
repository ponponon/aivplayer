import type {
  DramaGenerationMediaType,
  DramaGenerationParameters,
  DramaGenerationTask
} from '../../shared/drama-types'
import { DramaStore } from './drama-store'

const MEDIA_TYPES: readonly DramaGenerationMediaType[] = ['image', 'video', 'audio']

export type DramaGenerationProviderRequest = {
  task: DramaGenerationTask
  signal: AbortSignal
  onProgress?: (progress: number, message?: string) => void
}

export type DramaGenerationProviderResult = {
  resultPath: string
  providerId?: string
  model?: string
  parameters?: DramaGenerationParameters
  cost?: number
}

export type DramaGenerationProvider = {
  id: string
  generate: (request: DramaGenerationProviderRequest) => Promise<DramaGenerationProviderResult>
}

export type DramaGenerationWorkerOptions = {
  providers: Partial<Record<DramaGenerationMediaType, DramaGenerationProvider>>
  concurrency?: Partial<Record<DramaGenerationMediaType, number>>
  retryDelayMs?: number
  onTask?: (task: DramaGenerationTask) => void
}

export class DramaGenerationProviderError extends Error {
  readonly retryable: boolean

  constructor(message: string, retryable = true) {
    super(message)
    this.name = 'DramaGenerationProviderError'
    this.retryable = retryable
  }
}

type ActiveTask = { projectId: string; controller: AbortController }

export class DramaGenerationWorker {
  private readonly activeTasks = new Map<string, ActiveTask>()
  private stopRequested = false
  private providers: Partial<Record<DramaGenerationMediaType, DramaGenerationProvider>>

  constructor(private readonly store: DramaStore, private readonly options: DramaGenerationWorkerOptions) {
    this.providers = options.providers
  }

  setProviders(providers: Partial<Record<DramaGenerationMediaType, DramaGenerationProvider>>): void {
    this.providers = providers
  }

  async runProject(projectId: string): Promise<DramaGenerationTask[]> {
    this.stopRequested = false
    this.store.recoverGenerationTasks(projectId)
    const workers = MEDIA_TYPES.flatMap((mediaType) => {
      const count = Math.min(4, Math.max(1, Math.floor(this.options.concurrency?.[mediaType] ?? 1)))
      return Array.from({ length: count }, () => this.consume(projectId, mediaType))
    })
    await Promise.all(workers)
    return this.store.listGenerationTasks(projectId)
  }

  stop(projectId?: string): void {
    this.stopRequested = true
    for (const [taskId, active] of this.activeTasks) {
      if (projectId == null || active.projectId === projectId) active.controller.abort()
      if (projectId != null && active.projectId !== projectId) continue
      const task = this.store.getGenerationTask(active.projectId, taskId)
      if (task?.status === 'running' || task?.status === 'queued') this.store.updateGenerationTask(active.projectId, taskId, { status: 'queued', progress: 0, message: '等待恢复', error: null })
    }
  }

  cancelTask(projectId: string, taskId: string): DramaGenerationTask {
    const active = this.activeTasks.get(taskId)
    if (active?.projectId === projectId) active.controller.abort()
    return this.store.cancelGenerationTask(projectId, taskId)
  }

  private async consume(projectId: string, mediaType: DramaGenerationMediaType): Promise<void> {
    while (!this.stopRequested) {
      const task = this.store.claimNextGenerationTask(projectId, mediaType)
      if (!task) return
      const controller = new AbortController()
      this.activeTasks.set(task.id, { projectId, controller })
      this.emit(task)
      try {
        const provider = this.providers[mediaType]
        if (!provider) throw new DramaGenerationProviderError(`未配置 ${mediaType} 生成 Provider`, false)
        const result = await provider.generate({
          task,
          signal: controller.signal,
          onProgress: (progress, message) => this.updateProgress(projectId, task.id, progress, message)
        })
        const current = this.store.getGenerationTask(projectId, task.id)
        if (!current || current.status === 'cancelled') continue
        if (controller.signal.aborted || this.stopRequested) {
          if (current.status === 'running') {
            const recovered = this.store.updateGenerationTask(projectId, task.id, { status: 'queued', progress: 0, message: '等待恢复', error: null })
            this.emit(recovered)
          }
          continue
        }
        if (!result.resultPath?.trim()) throw new DramaGenerationProviderError('生成 Provider 未返回结果路径', false)
        const completed = this.store.updateGenerationTask(projectId, task.id, {
          status: 'completed',
          progress: 1,
          message: '生成完成',
          error: null,
          resultPath: result.resultPath.trim(),
          providerId: result.providerId ?? provider.id,
          model: result.model ?? task.model ?? null,
          parameters: result.parameters ?? task.parameters,
          actualCost: result.cost
        })
        this.emit(completed)
      } catch (error) {
        const current = this.store.getGenerationTask(projectId, task.id)
        if (!current || current.status === 'cancelled') continue
        if (this.stopRequested || isAbortError(error)) {
          const recovered = this.store.updateGenerationTask(projectId, task.id, { status: 'queued', progress: 0, message: '等待恢复', error: null })
          this.emit(recovered)
          continue
        }
        const message = error instanceof Error ? error.message : String(error)
        const failed = this.store.updateGenerationTask(projectId, task.id, { status: 'failed', progress: 0, message: '生成失败', error: message })
        this.emit(failed)
        if (error instanceof DramaGenerationProviderError && !error.retryable) continue
        const retried = this.store.retryGenerationTask(projectId, task.id, `等待重试：${message}`)
        if (retried) {
          this.emit(retried)
          try {
            await wait(this.retryDelayMs(task), controller.signal)
          } catch (waitError) {
            if (isAbortError(waitError)) return
            throw waitError
          }
        }
      } finally {
        this.activeTasks.delete(task.id)
      }
    }
  }

  private retryDelayMs(task: DramaGenerationTask): number {
    const base = Math.max(0, this.options.retryDelayMs ?? 250)
    return Math.min(30_000, base * (2 ** Math.max(0, task.attempt - 1)))
  }

  private emit(task: DramaGenerationTask): void {
    this.options.onTask?.(task)
  }

  private updateProgress(projectId: string, taskId: string, progress: number, message?: string): void {
    const current = this.store.getGenerationTask(projectId, taskId)
    if (!current || current.status !== 'running') return
    const updated = this.store.updateGenerationTask(projectId, taskId, {
      progress,
      message: message?.trim() || current.message
    })
    this.emit(updated)
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function wait(milliseconds: number, signal: AbortSignal): Promise<void> {
  if (milliseconds <= 0) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, milliseconds)
    const abort = (): void => {
      clearTimeout(timer)
      const error = new Error('生成任务已取消')
      error.name = 'AbortError'
      reject(error)
    }
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
  })
}
