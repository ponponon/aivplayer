import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { mkdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { VisionSearchFullExportRequest } from '../../shared/vision-types'
import { getVisionSearchRevisionBody, VISION_SEARCH_REVISION_SCHEMA_VERSION, type VisionSearchRevision, type VisionSearchTableName } from '../../shared/vision-search-revision'
import { normalizeSpeakerDiarizationCatalog } from './speaker-diarization-catalog'
import { normalizeVisionEntityCatalog } from './vision-entity-catalog'

export const VISION_SEARCH_EXPORT_STORE_SCHEMA_VERSION = 1
export const VISION_SEARCH_EXPORT_MAX_TASKS = 16
export const VISION_SEARCH_EXPORT_DEFAULT_CHUNK_SIZE = 256

export type VisionSearchExportPersistedStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'

export type VisionSearchExportTaskRecord = {
  taskId: string
  request: VisionSearchFullExportRequest
  outputPath: string
  partsDirectory: string
  chunkSize: number
  resultCount: number
  writtenCount: number
  completedParts: Record<string, string>
  searchRevision?: VisionSearchRevision
  status: VisionSearchExportPersistedStatus
  createdAt: number
  updatedAt: number
  error?: string
}

type VisionSearchExportManifest = {
  schemaVersion: number
  tasks: VisionSearchExportTaskRecord[]
}

type VisionSearchExportTaskInput = Pick<VisionSearchExportTaskRecord, 'taskId' | 'request' | 'outputPath' | 'partsDirectory'> & Partial<Pick<VisionSearchExportTaskRecord, 'chunkSize' | 'resultCount' | 'writtenCount' | 'completedParts' | 'searchRevision' | 'status' | 'createdAt' | 'updatedAt' | 'error'>>

type VisionSearchExportTaskPatch = Partial<Pick<VisionSearchExportTaskRecord, 'resultCount' | 'writtenCount' | 'completedParts' | 'searchRevision' | 'status' | 'updatedAt' | 'error'>>

const statuses: readonly VisionSearchExportPersistedStatus[] = ['queued', 'running', 'completed', 'failed', 'cancelled']
const revisionTableNames: readonly VisionSearchTableName[] = ['video_frames', 'video_sources', 'video_captions', 'video_search_documents', 'video_evidence']

function isValidRequest(value: unknown): value is VisionSearchFullExportRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const raw = value as Partial<VisionSearchFullExportRequest>
  return (raw.kind === 'text' || raw.kind === 'image' || raw.kind === 'similar')
    && (raw.format === 'json' || raw.format === 'csv')
    && Boolean(raw.request && typeof raw.request === 'object' && !Array.isArray(raw.request))
}

function isValidStatus(value: unknown): value is VisionSearchExportPersistedStatus {
  return typeof value === 'string' && statuses.includes(value as VisionSearchExportPersistedStatus)
}

function normalizeCompletedParts(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter(([key, hash]) => /^\d+$/.test(key) && typeof hash === 'string' && /^[a-f0-9]{64}$/.test(hash)))
}

function normalizeSearchRevision(value: unknown): VisionSearchRevision | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Partial<VisionSearchRevision> & { tables?: Record<string, unknown> }
  if (raw.schemaVersion !== VISION_SEARCH_REVISION_SCHEMA_VERSION || !raw.tables || typeof raw.tables !== 'object' || Array.isArray(raw.tables)) return undefined
  const tables = {} as VisionSearchRevision['tables']
  for (const name of revisionTableNames) {
    const version = raw.tables[name]
    if (version !== null && (!Number.isInteger(version) || Number(version) < 0)) return undefined
    tables[name] = version === null ? null : Number(version)
  }
  let catalogs: VisionSearchRevision['catalogs']
  if (raw.catalogs !== undefined) {
    if (!raw.catalogs || typeof raw.catalogs !== 'object' || Array.isArray(raw.catalogs)) return undefined
    const rawCatalogs = raw.catalogs as { entity?: unknown; speaker?: unknown }
    if (!rawCatalogs.entity || typeof rawCatalogs.entity !== 'object' || Array.isArray(rawCatalogs.entity) || !rawCatalogs.speaker || typeof rawCatalogs.speaker !== 'object' || Array.isArray(rawCatalogs.speaker)) return undefined
    catalogs = {
      entity: normalizeVisionEntityCatalog(rawCatalogs.entity),
      speaker: normalizeSpeakerDiarizationCatalog(rawCatalogs.speaker)
    }
  }
  const body = getVisionSearchRevisionBody({ schemaVersion: VISION_SEARCH_REVISION_SCHEMA_VERSION as typeof VISION_SEARCH_REVISION_SCHEMA_VERSION, tables, catalogs })
  const fingerprint = createHash('sha256').update(JSON.stringify(body)).digest('hex')
  return raw.fingerprint === fingerprint ? { ...body, fingerprint } : undefined
}

function normalizeTask(value: unknown): VisionSearchExportTaskRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Partial<VisionSearchExportTaskRecord>
  if (typeof raw.taskId !== 'string' || !raw.taskId.trim() || !isValidRequest(raw.request) || typeof raw.outputPath !== 'string' || !raw.outputPath.trim() || typeof raw.partsDirectory !== 'string' || !raw.partsDirectory.trim() || !isValidStatus(raw.status)) return null
  const now = Date.now()
  const chunkSize = typeof raw.chunkSize === 'number' && Number.isFinite(raw.chunkSize) ? Math.min(10_000, Math.max(1, Math.floor(raw.chunkSize))) : VISION_SEARCH_EXPORT_DEFAULT_CHUNK_SIZE
  const resultCount = typeof raw.resultCount === 'number' && Number.isFinite(raw.resultCount) ? Math.max(0, Math.floor(raw.resultCount)) : 0
  const writtenCount = typeof raw.writtenCount === 'number' && Number.isFinite(raw.writtenCount) ? Math.min(resultCount, Math.max(0, Math.floor(raw.writtenCount))) : 0
  const searchRevision = normalizeSearchRevision(raw.searchRevision)
  return {
    taskId: raw.taskId.trim().slice(0, 128),
    request: raw.request,
    outputPath: raw.outputPath.trim(),
    partsDirectory: raw.partsDirectory.trim(),
    chunkSize,
    resultCount,
    writtenCount,
    completedParts: normalizeCompletedParts(raw.completedParts),
    ...(searchRevision ? { searchRevision } : {}),
    status: raw.status,
    createdAt: typeof raw.createdAt === 'number' && Number.isFinite(raw.createdAt) ? raw.createdAt : now,
    updatedAt: typeof raw.updatedAt === 'number' && Number.isFinite(raw.updatedAt) ? raw.updatedAt : now,
    ...(typeof raw.error === 'string' && raw.error.trim() ? { error: raw.error.trim().slice(0, 2_000) } : {})
  }
}

function cloneTask(task: VisionSearchExportTaskRecord): VisionSearchExportTaskRecord {
  return JSON.parse(JSON.stringify(task)) as VisionSearchExportTaskRecord
}

export function getVisionSearchExportStorePath(userDataPath: string): string {
  return join(userDataPath, 'vision-search-exports.json')
}

export function getVisionSearchExportPartsDirectory(userDataPath: string, taskId: string): string {
  return join(userDataPath, 'vision-search-export-parts', taskId)
}

export class VisionSearchExportStore {
  private readonly manifestPath: string
  private readonly userDataPath: string
  private tasks: VisionSearchExportTaskRecord[]
  private writeChain: Promise<void> = Promise.resolve()

  constructor(userDataPath: string) {
    this.userDataPath = userDataPath
    this.manifestPath = getVisionSearchExportStorePath(userDataPath)
    mkdirSync(dirname(this.manifestPath), { recursive: true })
    try {
      const manifest = JSON.parse(readFileSync(this.manifestPath, 'utf8')) as Partial<VisionSearchExportManifest>
      this.tasks = manifest.schemaVersion === VISION_SEARCH_EXPORT_STORE_SCHEMA_VERSION && Array.isArray(manifest.tasks)
        ? manifest.tasks.map(normalizeTask).filter((task): task is VisionSearchExportTaskRecord => task !== null).slice(0, VISION_SEARCH_EXPORT_MAX_TASKS)
        : []
    } catch {
      this.tasks = []
    }
  }

  list(): VisionSearchExportTaskRecord[] {
    return this.tasks.map(cloneTask)
  }

  listRecoverable(): VisionSearchExportTaskRecord[] {
    return this.list().filter((task) => task.status === 'queued' || task.status === 'running')
  }

  listRetryable(): VisionSearchExportTaskRecord[] {
    return this.list().filter((task) => task.status === 'failed' || task.status === 'cancelled')
  }

  get(taskId: string): VisionSearchExportTaskRecord | null {
    const task = this.tasks.find((item) => item.taskId === taskId)
    return task ? cloneTask(task) : null
  }

  create(input: VisionSearchExportTaskInput): VisionSearchExportTaskRecord {
    if (this.tasks.some((task) => task.taskId === input.taskId)) throw new Error('视觉搜索导出任务已存在')
    const now = Date.now()
    const task = normalizeTask({
      ...input,
      chunkSize: input.chunkSize ?? VISION_SEARCH_EXPORT_DEFAULT_CHUNK_SIZE,
      resultCount: input.resultCount ?? 0,
      writtenCount: input.writtenCount ?? 0,
      completedParts: input.completedParts ?? {},
      status: input.status ?? 'queued',
      createdAt: input.createdAt ?? now,
      updatedAt: input.updatedAt ?? now
    })
    if (!task) throw new Error('视觉搜索导出任务参数无效')
    this.tasks = [task, ...this.tasks].slice(0, VISION_SEARCH_EXPORT_MAX_TASKS)
    this.enqueueWrite()
    return cloneTask(task)
  }

  update(taskId: string, patch: VisionSearchExportTaskPatch): VisionSearchExportTaskRecord | null {
    const index = this.tasks.findIndex((task) => task.taskId === taskId)
    if (index < 0) return null
    const current = this.tasks[index] as VisionSearchExportTaskRecord
    const next = normalizeTask({ ...current, ...patch, updatedAt: patch.updatedAt ?? Date.now() })
    if (!next) return null
    this.tasks = [...this.tasks.slice(0, index), next, ...this.tasks.slice(index + 1)]
    this.enqueueWrite()
    return cloneTask(next)
  }

  markPartCompleted(taskId: string, partIndex: number, hash: string, writtenCount: number): VisionSearchExportTaskRecord | null {
    const current = this.get(taskId)
    if (!current || !Number.isInteger(partIndex) || partIndex < 0 || !/^[a-f0-9]{64}$/.test(hash)) return null
    return this.update(taskId, {
      completedParts: { ...current.completedParts, [partIndex]: hash },
      writtenCount,
      status: 'running',
      error: undefined
    })
  }

  retry(taskId: string): VisionSearchExportTaskRecord | null {
    const current = this.get(taskId)
    if (!current || (current.status !== 'failed' && current.status !== 'cancelled')) return null
    return this.update(taskId, { status: 'queued', error: undefined })
  }

  async flush(): Promise<void> {
    await this.writeChain
  }

  private enqueueWrite(): void {
    const manifest: VisionSearchExportManifest = { schemaVersion: VISION_SEARCH_EXPORT_STORE_SCHEMA_VERSION, tasks: this.tasks.map(cloneTask) }
    this.writeChain = this.writeChain.then(async () => {
      await mkdir(dirname(this.manifestPath), { recursive: true })
      await mkdir(this.userDataPath, { recursive: true })
      const temporaryPath = `${this.manifestPath}.${process.pid}.tmp`
      await writeFile(temporaryPath, JSON.stringify(manifest, null, 2), { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.manifestPath)
    }).catch(() => undefined)
  }
}
