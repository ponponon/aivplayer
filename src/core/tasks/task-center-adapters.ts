import { basename } from 'node:path'
import { createHash } from 'node:crypto'
import type { AsrJobProgress, BatchSubtitleJob } from '../../shared/media-types'
import type { DramaGenerationTask, DramaProgress } from '../../shared/drama-types'
import type { MediaEvidenceTask } from '../../shared/evidence-task-types'
import type { MediaImportInboxItem, MediaImportInboxPipelineProgress } from '../../shared/media-import-inbox'
import type { VisionIndexProgress } from '../../shared/vision-types'
import type { TaskCenterEvent, TaskCenterStatus } from '../../shared/task-center-types'

function safeProgress(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(1, value))
}

function mediaName(path: string | undefined): string | undefined {
  return path?.trim() ? basename(path) : undefined
}

function stablePathKey(path: string | undefined): string {
  const normalized = path?.trim()
  return normalized ? createHash('sha256').update(normalized).digest('hex').slice(0, 16) : 'active'
}

function asrStatus(stage: AsrJobProgress['stage']): TaskCenterStatus {
  if (stage === 'completed') return 'completed'
  if (stage === 'cancelled') return 'cancelled'
  if (stage === 'failed') return 'failed'
  return 'running'
}

export function createAsrTaskCenterEvent(progress: AsrJobProgress, now = Date.now()): TaskCenterEvent {
  const id = `asr:${stablePathKey(progress.mediaPath)}`
  return {
    id,
    kind: 'asr',
    status: asrStatus(progress.stage),
    title: '字幕与总结',
    message: progress.message,
    progress: safeProgress(progress.percent),
    current: mediaName(progress.mediaPath),
    updatedAt: now
  }
}

function batchProgress(job: BatchSubtitleJob): number | null {
  if (job.summary.total <= 0) return null
  const currentPercent = job.items.find((item) => item.id === job.currentItemId)?.percent
  return safeProgress((job.summary.completed + (currentPercent ?? 0)) / job.summary.total)
}

export function createBatchSubtitleTaskCenterEvent(job: BatchSubtitleJob, now = Date.now()): TaskCenterEvent {
  const status: TaskCenterStatus = job.status === 'running'
    ? 'running'
    : job.status === 'paused'
      ? 'paused'
      : job.status === 'completed'
        ? 'completed'
        : job.status === 'cancelled'
          ? 'cancelled'
          : 'failed'
  const currentItem = job.items.find((item) => item.id === job.currentItemId)
  return {
    id: `batch-subtitle:${job.id}`,
    kind: 'batch-subtitle',
    status,
    title: '批量字幕',
    message: job.message,
    progress: batchProgress(job),
    current: currentItem?.file.name,
    updatedAt: now
  }
}

function visionStatus(status: VisionIndexProgress['status']): TaskCenterStatus {
  if (status === 'completed') return 'completed'
  if (status === 'cancelled') return 'cancelled'
  if (status === 'error') return 'failed'
  if (status === 'idle') return 'queued'
  return 'running'
}

function visionProgress(progress: VisionIndexProgress): number | null {
  if (progress.stage === 'scene-evidence' && (progress.sceneEvidenceTotal ?? 0) > 0) {
    return safeProgress((progress.sceneEvidenceProcessed ?? 0) / (progress.sceneEvidenceTotal ?? 1))
  }
  if (progress.stage === 'entity-evidence' && (progress.entityEvidenceTotal ?? 0) > 0) {
    return safeProgress((progress.entityEvidenceProcessed ?? 0) / (progress.entityEvidenceTotal ?? 1))
  }
  if (progress.stage === 'object-evidence' && (progress.objectEvidenceTotal ?? 0) > 0) {
    return safeProgress((progress.objectEvidenceProcessed ?? 0) / (progress.objectEvidenceTotal ?? 1))
  }
  if (progress.totalFrames > 0) return safeProgress(progress.processedFrames / progress.totalFrames)
  if (progress.totalVideos > 0) return safeProgress(progress.currentVideoIndex / progress.totalVideos)
  return null
}

export function createVisionTaskCenterEvent(progress: VisionIndexProgress, now = Date.now()): TaskCenterEvent {
  return {
    id: 'vision-index',
    kind: 'vision-index',
    status: visionStatus(progress.status),
    title: '视觉索引',
    message: progress.error || progress.message || '正在更新视觉索引',
    progress: visionProgress(progress),
    current: mediaName(progress.currentVideoPath),
    updatedAt: now
  }
}

function mediaImportProgress(progress: MediaImportInboxPipelineProgress): number | null {
  const stageIndex = { metadata: 0, subtitle: 1, vision: 2 }[progress.stage]
  const stageProgress = progress.progress ? visionProgress(progress.progress) ?? 0 : progress.status === 'ready' || progress.status === 'skipped' ? 1 : 0
  return safeProgress((stageIndex + stageProgress) / 3)
}

function mediaImportStatus(progress: MediaImportInboxPipelineProgress): TaskCenterStatus {
  if (progress.status === 'failed') return 'failed'
  if (progress.stage === 'vision' && progress.status === 'ready') return 'completed'
  if (progress.status === 'pending') return 'queued'
  return 'running'
}

export function createMediaImportTaskCenterEvent(progress: MediaImportInboxPipelineProgress, item?: Pick<MediaImportInboxItem, 'fileName'>, now = Date.now()): TaskCenterEvent {
  return {
    id: `media-import:${progress.itemId}`,
    kind: 'media-import',
    status: mediaImportStatus(progress),
    title: '本地导入',
    message: progress.message || `${progress.stage} 阶段${progress.status}`,
    progress: mediaImportProgress(progress),
    current: item?.fileName,
    updatedAt: now
  }
}

export function createEvidenceTaskCenterEvent(task: MediaEvidenceTask, now = task.updatedAt || Date.now()): TaskCenterEvent {
  const status: TaskCenterStatus = task.status === 'queued'
    ? 'queued'
    : task.status === 'running' || task.status === 'retrying'
      ? 'running'
      : task.status === 'completed'
        ? 'completed'
        : task.status === 'cancelled'
          ? 'cancelled'
          : 'failed'
  return {
    id: `evidence:${task.id}`,
    kind: 'evidence',
    status,
    title: task.kind === 'ocr' ? 'OCR 证据' : 'TTS 证据',
    message: task.error || task.persistenceMessage || `${task.kind.toUpperCase()} ${task.status}`,
    progress: safeProgress(task.progress),
    current: mediaName(task.mediaPath),
    updatedAt: now
  }
}

export function createDramaTaskCenterEvent(progress: DramaProgress, now = Date.now()): TaskCenterEvent {
  const normalizedTotal = Math.max(1, progress.total)
  return {
    id: `drama:${progress.stage}`,
    kind: 'drama',
    status: progress.current >= normalizedTotal ? 'completed' : 'running',
    title: '短剧工作流',
    message: progress.message,
    progress: safeProgress(progress.current / normalizedTotal),
    updatedAt: now
  }
}

export function createDramaGenerationTaskCenterEvent(task: DramaGenerationTask, now = task.updatedAt || Date.now()): TaskCenterEvent {
  const status: TaskCenterStatus = task.status === 'queued'
    ? 'queued'
    : task.status === 'running'
      ? 'running'
      : task.status === 'completed'
        ? 'completed'
        : task.status === 'cancelled'
          ? 'cancelled'
          : 'failed'
  return {
    id: `drama-generation:${task.id}`,
    kind: 'drama-generation',
    status,
    title: `短剧${task.mediaType}生成`,
    message: task.error || task.message,
    progress: safeProgress(task.progress),
    current: task.targetId,
    updatedAt: now
  }
}
