import { createHash } from 'node:crypto'
import { basename, normalize } from 'node:path'
import type { VisionIndexFailureRecord, VisionIndexProgress, VisionIndexStage } from '../../shared/vision-types'

export const VISION_INDEX_FAILURE_SCHEMA_VERSION = 1
export const VISION_INDEX_FAILURE_MAX_RECORDS = 100
export const VISION_INDEX_FAILURE_MAX_ERROR_LENGTH = 2_000
export const VISION_INDEX_FAILURE_MAX_RETRY_BATCH = 100

export type VisionIndexFailureInput = {
  mediaPath: string
  error: string
  failedAt?: number
  intervalSeconds?: number
  includeSceneEvidence?: boolean
  includeEntityEvidence?: boolean
  stage?: VisionIndexStage
}

export type VisionIndexFailureManifest = {
  schemaVersion: number
  records: VisionIndexFailureRecord[]
}

const visionIndexStages: readonly VisionIndexStage[] = [
  'planning',
  'loading-model',
  'frames',
  'scene-evidence',
  'entity-evidence',
  'vector-index',
  'text-index',
  'completed',
  'cancelled',
  'error'
]

function clampError(error: string): string {
  return error.trim().slice(0, VISION_INDEX_FAILURE_MAX_ERROR_LENGTH) || '视觉索引失败'
}

function normalizeMediaPath(mediaPath: string): string {
  return normalize(mediaPath.trim())
}

function normalizeTimestamp(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.round(value) : fallback
}

function normalizeInterval(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 3
}

function isVisionIndexStage(value: unknown): value is VisionIndexStage {
  return typeof value === 'string' && visionIndexStages.includes(value as VisionIndexStage)
}

export function createVisionIndexFailureId(mediaPath: string): string {
  return `vision-failure-${createHash('sha256').update(normalizeMediaPath(mediaPath)).digest('hex').slice(0, 32)}`
}

export function normalizeVisionIndexFailure(value: unknown, now = Date.now()): VisionIndexFailureRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<VisionIndexFailureRecord>
  if (typeof raw.mediaPath !== 'string' || !raw.mediaPath.trim()) return null
  const mediaPath = normalizeMediaPath(raw.mediaPath)
  const failedAt = normalizeTimestamp(raw.failedAt, now)
  const lastAttemptAt = normalizeTimestamp(raw.lastAttemptAt, failedAt)
  const retryCount = typeof raw.retryCount === 'number' && Number.isFinite(raw.retryCount) ? Math.max(0, Math.floor(raw.retryCount)) : 0
  return {
    id: createVisionIndexFailureId(mediaPath),
    mediaPath,
    fileName: basename(mediaPath),
    error: clampError(typeof raw.error === 'string' ? raw.error : ''),
    failedAt,
    lastAttemptAt: Math.max(failedAt, lastAttemptAt),
    retryCount,
    intervalSeconds: normalizeInterval(raw.intervalSeconds),
    includeSceneEvidence: raw.includeSceneEvidence === true,
    includeEntityEvidence: raw.includeEntityEvidence === true,
    stage: isVisionIndexStage(raw.stage) ? raw.stage : 'error'
  }
}

export function normalizeVisionIndexFailureManifest(value: unknown, now = Date.now()): VisionIndexFailureManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { schemaVersion: VISION_INDEX_FAILURE_SCHEMA_VERSION, records: [] }
  const raw = value as Partial<VisionIndexFailureManifest>
  if (raw.schemaVersion !== VISION_INDEX_FAILURE_SCHEMA_VERSION || !Array.isArray(raw.records)) {
    return { schemaVersion: VISION_INDEX_FAILURE_SCHEMA_VERSION, records: [] }
  }
  const records = raw.records
    .map((record) => normalizeVisionIndexFailure(record, now))
    .filter((record): record is VisionIndexFailureRecord => record !== null)
    .sort((left, right) => right.lastAttemptAt - left.lastAttemptAt)
    .slice(0, VISION_INDEX_FAILURE_MAX_RECORDS)
  return { schemaVersion: VISION_INDEX_FAILURE_SCHEMA_VERSION, records }
}

export function recordVisionIndexFailure(
  records: readonly VisionIndexFailureRecord[],
  input: VisionIndexFailureInput,
  now = Date.now()
): VisionIndexFailureRecord[] {
  const mediaPath = normalizeMediaPath(input.mediaPath)
  if (!mediaPath) return [...records]
  const id = createVisionIndexFailureId(mediaPath)
  const previous = records.find((record) => record.id === id)
  const next = normalizeVisionIndexFailure({
    id,
    mediaPath,
    error: input.error,
    failedAt: previous?.failedAt ?? input.failedAt ?? now,
    lastAttemptAt: input.failedAt ?? now,
    retryCount: previous?.retryCount ?? 0,
    intervalSeconds: input.intervalSeconds,
    includeSceneEvidence: input.includeSceneEvidence,
    includeEntityEvidence: input.includeEntityEvidence,
    stage: input.stage
  }, now)
  if (!next) return [...records]
  return [next, ...records.filter((record) => record.id !== id)]
    .sort((left, right) => right.lastAttemptAt - left.lastAttemptAt)
    .slice(0, VISION_INDEX_FAILURE_MAX_RECORDS)
}

export function beginVisionIndexFailureRetry(
  records: readonly VisionIndexFailureRecord[],
  id: string,
  now = Date.now()
): VisionIndexFailureRecord | null {
  const current = records.find((record) => record.id === id)
  if (!current) return null
  const next = { ...current, lastAttemptAt: now, retryCount: current.retryCount + 1 }
  return next
}

export function beginVisionIndexFailureRetryBatch(
  records: readonly VisionIndexFailureRecord[],
  ids: readonly string[],
  now = Date.now()
): VisionIndexFailureRecord[] | null {
  if (ids.length === 0 || ids.length > VISION_INDEX_FAILURE_MAX_RETRY_BATCH) return null
  const requestedIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))]
  if (requestedIds.length !== ids.length) return null
  const selectedIds = new Set(requestedIds)
  if (requestedIds.some((id) => !records.some((record) => record.id === id))) return null
  return records
    .map((record) => selectedIds.has(record.id) ? { ...record, lastAttemptAt: now, retryCount: record.retryCount + 1 } : { ...record })
    .sort((left, right) => right.lastAttemptAt - left.lastAttemptAt)
}

export function visionIndexFailureFromProgress(
  progress: VisionIndexProgress,
  options: Pick<VisionIndexFailureInput, 'intervalSeconds' | 'includeSceneEvidence' | 'includeEntityEvidence'>,
  now = Date.now()
): VisionIndexFailureInput | null {
  if (progress.status !== 'error' || !progress.currentVideoPath) return null
  return {
    mediaPath: progress.currentVideoPath,
    error: progress.error ?? progress.message ?? '视觉索引失败',
    failedAt: now,
    intervalSeconds: options.intervalSeconds,
    includeSceneEvidence: options.includeSceneEvidence,
    includeEntityEvidence: options.includeEntityEvidence,
    stage: progress.failedStage ?? 'error'
  }
}
