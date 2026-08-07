import type { MediaEvidenceArtifact, MediaEvidenceRange, MediaEvidenceTask } from '../../shared/evidence-task-types'
import {
  cancelMediaEvidenceTask,
  completeMediaEvidenceTask,
  failMediaEvidenceTask,
  retryMediaEvidenceTask,
  startMediaEvidenceTask,
  updateMediaEvidenceTaskProgress
} from './evidence-task'

export type MediaEvidenceTaskOperationRequest = {
  task: MediaEvidenceTask
  range: MediaEvidenceRange
  rangeIndex: number
  totalRanges: number
  inputText?: string
}

export type MediaEvidenceTaskOperation = (
  request: MediaEvidenceTaskOperationRequest,
  signal: AbortSignal
) => Promise<MediaEvidenceArtifact>

export type RunMediaEvidenceTaskOptions = {
  signal?: AbortSignal
  ocr?: MediaEvidenceTaskOperation
  tts?: MediaEvidenceTaskOperation
  onTaskChange?: (task: MediaEvidenceTask) => void | Promise<void>
  now?: () => number
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function isAbortError(error: unknown, signal: AbortSignal): boolean {
  return signal.aborted || (error instanceof Error && error.name === 'AbortError')
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  const error = new Error('媒体证据任务已取消')
  error.name = 'AbortError'
  throw error
}

function resolveOperation(task: MediaEvidenceTask, options: RunMediaEvidenceTaskOptions): MediaEvidenceTaskOperation | undefined {
  return task.kind === 'ocr' ? options.ocr : options.tts
}

/**
 * Runs one evidence task through the shared state machine. Engine adapters only
 * produce one artifact per time range; task state, retries, cancellation, and
 * source validation remain in the core layer.
 */
export async function runMediaEvidenceTask(initialTask: MediaEvidenceTask, options: RunMediaEvidenceTaskOptions = {}): Promise<MediaEvidenceTask> {
  const signal = options.signal ?? new AbortController().signal
  const now = options.now ?? Date.now
  let task = initialTask
  const artifacts: MediaEvidenceArtifact[] = []

  const emit = async (next: MediaEvidenceTask): Promise<void> => {
    task = next
    await options.onTaskChange?.(task)
  }

  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return task
  if (signal.aborted) return cancelMediaEvidenceTask(task, now())

  while (task.status === 'queued' || task.status === 'retrying' || task.status === 'running') {
    if (task.status === 'queued' || task.status === 'retrying') {
      await emit(startMediaEvidenceTask(task, now()))
    }

    const operation = resolveOperation(task, options)
    if (!operation) {
      const failed = failMediaEvidenceTask(task, `${task.kind.toUpperCase()} 执行器未配置`, now())
      await emit(failed)
      if (failed.status !== 'retrying') return failed
      await emit(retryMediaEvidenceTask(failed, now()))
      continue
    }

    artifacts.length = 0
    try {
      for (let index = 0; index < task.ranges.length; index += 1) {
        throwIfAborted(signal)
        const range = task.ranges[index]!
        const artifact = await operation({ task, range, rangeIndex: index, totalRanges: task.ranges.length, inputText: task.inputText }, signal)
        artifacts.push(artifact)
        await emit(updateMediaEvidenceTaskProgress(task, (index + 1) / Math.max(1, task.ranges.length), now()))
      }

      const completed = completeMediaEvidenceTask(task, artifacts, now())
      await emit(completed)
      return completed
    } catch (error) {
      if (isAbortError(error, signal)) {
        const cancelled = cancelMediaEvidenceTask(task, now())
        await emit(cancelled)
        return cancelled
      }

      const failed = failMediaEvidenceTask(task, errorMessage(error), now())
      await emit(failed)
      if (failed.status !== 'retrying') return failed
      await emit(retryMediaEvidenceTask(failed, now()))
    }
  }

  return task
}
