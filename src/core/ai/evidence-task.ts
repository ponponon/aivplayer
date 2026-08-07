import { createHash } from 'node:crypto'
import type { VisionEvidence } from '../../shared/vision-types'
import type { MediaEvidenceArtifact, MediaEvidenceRange, MediaEvidenceTask, MediaEvidenceTaskKind, OcrEvidenceArtifact } from '../../shared/evidence-task-types'

type CreateMediaEvidenceTaskInput = {
  kind: MediaEvidenceTaskKind
  mediaPath: string
  sourceFingerprint: string
  inputHash: string
  ranges?: readonly MediaEvidenceRange[]
  maxRetries?: number
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function normalizeRange(range: MediaEvidenceRange): MediaEvidenceRange | null {
  if (!Number.isFinite(range.startSeconds) || !Number.isFinite(range.endSeconds)) return null
  const startSeconds = Math.max(0, roundSeconds(range.startSeconds))
  const endSeconds = Math.max(0, roundSeconds(range.endSeconds))
  return endSeconds > startSeconds ? { startSeconds, endSeconds } : null
}

function normalizeRanges(ranges: readonly MediaEvidenceRange[] | undefined): MediaEvidenceRange[] {
  return [...new Map((ranges ?? []).map(normalizeRange).filter((range): range is MediaEvidenceRange => range !== null).map((range) => [`${range.startSeconds}:${range.endSeconds}`, range])).values()].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
}

function normalizeRetries(value: number | undefined): number {
  return Number.isFinite(value) ? Math.min(3, Math.max(0, Math.floor(value ?? 0))) : 2
}

function nowOr(value: number | undefined): number {
  return value !== undefined && Number.isFinite(value) ? value : Date.now()
}

function taskId(input: CreateMediaEvidenceTaskInput, ranges: readonly MediaEvidenceRange[]): string {
  return `evidence-task-${hash([input.kind, input.mediaPath, input.sourceFingerprint, input.inputHash, JSON.stringify(ranges)].join('\0'))}`
}

function copyTask(task: MediaEvidenceTask, patch: Partial<MediaEvidenceTask>, updatedAt: number): MediaEvidenceTask {
  return { ...task, ...patch, ranges: [...(patch.ranges ?? task.ranges)], artifacts: [...(patch.artifacts ?? task.artifacts)], updatedAt }
}

export function createMediaEvidenceTask(input: CreateMediaEvidenceTaskInput, createdAt = Date.now()): MediaEvidenceTask {
  const ranges = normalizeRanges(input.ranges)
  return {
    id: taskId(input, ranges),
    kind: input.kind,
    mediaPath: input.mediaPath,
    sourceFingerprint: input.sourceFingerprint,
    inputHash: input.inputHash,
    ranges,
    status: 'queued',
    progress: 0,
    attempts: 0,
    maxRetries: normalizeRetries(input.maxRetries),
    artifacts: [],
    createdAt,
    updatedAt: createdAt
  }
}

export function startMediaEvidenceTask(task: MediaEvidenceTask, updatedAt = Date.now()): MediaEvidenceTask {
  if (task.status !== 'queued' && task.status !== 'retrying') return task
  return copyTask(task, { status: 'running', attempts: task.attempts + 1, error: undefined }, nowOr(updatedAt))
}

export function updateMediaEvidenceTaskProgress(task: MediaEvidenceTask, progress: number, updatedAt = Date.now()): MediaEvidenceTask {
  if (task.status !== 'running') return task
  return copyTask(task, { progress: Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : task.progress)) }, nowOr(updatedAt))
}

function normalizeArtifact(task: MediaEvidenceTask, artifact: MediaEvidenceArtifact): MediaEvidenceArtifact | null {
  if (artifact.sourceFingerprint !== task.sourceFingerprint) return null
  const range = normalizeRange(artifact)
  const text = artifact.text.trim()
  if (!range || !text) return null
  if (artifact.artifactType === 'ocr-evidence') {
    const confidence = artifact.confidence !== undefined && Number.isFinite(artifact.confidence) ? Math.min(1, Math.max(0, artifact.confidence)) : undefined
    return { ...artifact, ...range, text, ...(confidence === undefined ? {} : { confidence }), ...(artifact.frameId?.trim() ? { frameId: artifact.frameId.trim() } : {}) }
  }
  return { ...artifact, ...range, text, ...(artifact.audioPath?.trim() ? { audioPath: artifact.audioPath.trim() } : {}), ...(artifact.mimeType?.trim() ? { mimeType: artifact.mimeType.trim() } : {}) }
}

export function completeMediaEvidenceTask(task: MediaEvidenceTask, artifacts: readonly MediaEvidenceArtifact[], updatedAt = Date.now()): MediaEvidenceTask {
  if (task.status !== 'running') return task
  const normalized = [...new Map(artifacts.map((artifact) => normalizeArtifact(task, artifact)).filter((artifact): artifact is MediaEvidenceArtifact => artifact !== null).map((artifact) => [artifact.id, artifact])).values()]
  return copyTask(task, { status: 'completed', progress: 1, artifacts: normalized, error: undefined }, nowOr(updatedAt))
}

export function failMediaEvidenceTask(task: MediaEvidenceTask, error: string, updatedAt = Date.now()): MediaEvidenceTask {
  if (task.status !== 'running' && task.status !== 'retrying') return task
  const message = error.trim() || 'Evidence task failed'
  return copyTask(task, { status: task.attempts < task.maxRetries ? 'retrying' : 'failed', error: message }, nowOr(updatedAt))
}

export function retryMediaEvidenceTask(task: MediaEvidenceTask, updatedAt = Date.now()): MediaEvidenceTask {
  if (task.status !== 'retrying' || task.attempts >= task.maxRetries) return task
  return copyTask(task, { status: 'queued', progress: 0, error: undefined, artifacts: [] }, nowOr(updatedAt))
}

export function cancelMediaEvidenceTask(task: MediaEvidenceTask, updatedAt = Date.now()): MediaEvidenceTask {
  if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') return task
  return copyTask(task, { status: 'cancelled', error: undefined }, nowOr(updatedAt))
}

export function toVisionOcrEvidence(artifact: OcrEvidenceArtifact, input: { sourceId: string; videoPath: string; fileName: string; modelId: string; modelVariant?: string; generatedAt?: number }): VisionEvidence {
  return {
    id: artifact.id,
    sourceId: input.sourceId,
    videoPath: input.videoPath,
    fileName: input.fileName,
    evidenceType: 'ocr',
    startSeconds: artifact.startSeconds,
    endSeconds: artifact.endSeconds,
    text: artifact.text,
    frameId: artifact.frameId,
    confidence: artifact.confidence,
    sourceFingerprint: artifact.sourceFingerprint,
    modelId: input.modelId,
    modelVariant: input.modelVariant,
    generatedAt: input.generatedAt
  }
}
