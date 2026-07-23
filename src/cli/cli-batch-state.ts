import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { basename, dirname, resolve } from 'node:path'
import type { BatchPlan } from './cli-batch-plan'

export const CLI_BATCH_STATE_VERSION = 1

export type BatchSavedSubtitleOutput = {
  format: 'vtt' | 'srt'
  path: string
}

export type BatchSavedStage = {
  completedAt: number
  retries?: number
  subtitlePath?: string
  subtitleSrtPath?: string
  sourceSubtitlePath?: string
  outputs: BatchSavedSubtitleOutput[]
}

export type BatchRetryState = {
  stage: 'asr' | 'translate'
  attempt: number
  maxRetries: number
  lastError: string
  nextRetryAt: number
}

export type BatchStateVideo = {
  path: string
  sizeBytes: number
  mtimeMs: number
  asr?: BatchSavedStage
  translate?: BatchSavedStage
  retry?: BatchRetryState
  lastError?: {
    stage: 'asr' | 'translate' | 'index'
    message: string
    at: number
  }
}

export type BatchPlanIdentity = {
  inputs: string[]
  recursive: boolean
  asr: boolean
  translateLanguage?: string
  sourceLanguage: string
  index: boolean
  format: BatchPlan['format']
  outputDirectory?: string
  modelId?: string
  language?: string
  intervalSeconds: number
}

export type CliBatchState = {
  version: typeof CLI_BATCH_STATE_VERSION
  id: string
  createdAt: number
  updatedAt: number
  planFingerprint: string
  plan: BatchPlanIdentity
  videos: Record<string, BatchStateVideo>
  index?: {
    key: string
    completedAt: number
  }
}

export type BatchFileSignature = {
  path: string
  sizeBytes: number
  mtimeMs: number
}

export function getBatchPlanIdentity(plan: BatchPlan): BatchPlanIdentity {
  return {
    inputs: plan.inputs.map((input) => resolve(input)),
    recursive: plan.recursive,
    asr: plan.asr,
    translateLanguage: plan.translateLanguage,
    sourceLanguage: plan.sourceLanguage,
    index: plan.index,
    format: plan.format,
    outputDirectory: plan.outputDirectory ? resolve(plan.outputDirectory) : undefined,
    modelId: plan.modelId,
    language: plan.language,
    intervalSeconds: plan.intervalSeconds
  }
}

export function getBatchPlanFingerprint(plan: BatchPlan): string {
  const identity = JSON.stringify(getBatchPlanIdentity(plan))
  return createHash('sha256').update(identity).digest('hex')
}

export function createBatchState(plan: BatchPlan, signatures: BatchFileSignature[]): CliBatchState {
  const now = Date.now()
  return {
    version: CLI_BATCH_STATE_VERSION,
    id: `aivcli-batch-${now}`,
    createdAt: now,
    updatedAt: now,
    planFingerprint: getBatchPlanFingerprint(plan),
    plan: getBatchPlanIdentity(plan),
    videos: Object.fromEntries(signatures.map((signature) => [signature.path, { ...signature }]))
  }
}

export function reconcileBatchState(state: CliBatchState, signatures: BatchFileSignature[]): boolean {
  let changed = false
  for (const signature of signatures) {
    const previous = state.videos[signature.path]
    if (!previous || previous.sizeBytes !== signature.sizeBytes || previous.mtimeMs !== signature.mtimeMs) {
      state.videos[signature.path] = { ...signature }
      state.index = undefined
      changed = true
    }
  }
  if (changed) state.updatedAt = Date.now()
  return changed
}

export async function loadBatchState(statePath: string): Promise<CliBatchState | null> {
  try {
    const content = await readFile(statePath, 'utf8')
    const parsed: unknown = JSON.parse(content)
    if (!parsed || typeof parsed !== 'object') throw new Error('状态文件不是有效 JSON 对象')
    const state = parsed as Partial<CliBatchState>
    if (state.version !== CLI_BATCH_STATE_VERSION || typeof state.id !== 'string' || typeof state.planFingerprint !== 'string' || !state.plan || !state.videos) {
      throw new Error(`状态文件版本不受支持：${String(state.version ?? 'unknown')}`)
    }
    return state as CliBatchState
  } catch (error) {
    if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

export async function saveBatchState(statePath: string, state: CliBatchState): Promise<void> {
  state.updatedAt = Date.now()
  await mkdir(dirname(statePath), { recursive: true })
  const temporaryPath = joinTemporaryStatePath(statePath)
  await writeFile(temporaryPath, `${JSON.stringify(state, null, 2)}\n`, 'utf8')
  await rename(temporaryPath, statePath)
}

function joinTemporaryStatePath(statePath: string): string {
  return resolve(dirname(statePath), `.${basename(statePath)}.tmp`)
}

export function createBatchIndexKey(
  signatures: BatchFileSignature[],
  subtitleSources: Array<{ videoPath: string; subtitlePath?: string; sizeBytes?: number; mtimeMs?: number }>
): string {
  const payload = signatures
    .map((signature) => ({
      ...signature,
      subtitle: subtitleSources.find((source) => source.videoPath === signature.path) ?? null
    }))
    .sort((left, right) => left.path.localeCompare(right.path))
  return createHash('sha256').update(JSON.stringify(payload)).digest('hex')
}
