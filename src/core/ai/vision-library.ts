import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { Field, Float64, Schema, Utf8 } from 'apache-arrow'
import { connect, Index, type Table, type VectorQuery } from '@lancedb/lancedb'
import { isVideoFilePath } from '../media/file-opening'
import { DEFAULT_MIN_SCENE_DURATION_SECONDS, DEFAULT_SCENE_DETECTION_THRESHOLD } from '../media/scene-detection'
import { detectSceneCutTimestamps } from '../media/scene-detection-runtime'
import { parseVtt } from './subtitle-writer.ts'
import { resolveFfmpegPath, resolveFfprobePath } from './whisper-cpp-runtime'
import { VisionEmbeddingRuntime } from './vision-model'
import { VisionObjectDetectionRuntime, type VisionObjectDetectionRuntimeOptions } from './vision-object-detection-runtime'
import { DEFAULT_VISION_ENTITY_LABELS, createVisionEntityEvidence, getVisionEntityLabelIdForDisplayName, type VisionEntityLabel } from './vision-entity-evidence'
import { createVisionObjectDetectionEvidence } from './vision-object-detection-evidence'
import { createVisionSceneEvidence } from './vision-scene-evidence'
import { calculateVisionLexicalMatch, combineVisionHybridScore, getVisionSearchResultKey } from './vision-search'
import { isVisionObjectDetectionFilterActive, normalizeVisionObjectDetectionFilterState } from './vision-object-detection-filter'
import { isVisionSimilarSearchTarget, normalizeVisionSimilarSearchRequest } from './vision-similar-search'
import { createVisionEvidenceId, createVisionSourceFingerprint, createVisionSourceId } from './vision-evidence'
import {
  VISION_FRAME_INTERVAL_SECONDS,
  VISION_MODEL_ID,
  VISION_MODEL_VARIANT,
  VISION_SEARCH_FULL_EXPORT_MAX_RESULTS,
  VISION_VECTOR_DISTANCE_TYPE,
  VISION_VECTOR_INDEX_MIN_ROWS,
  VISION_VECTOR_INDEX_TYPE,
  type VisionIndexProgress,
  type VisionIndexStage,
  type VisionIndexTimings,
  type VisionIndexOptions,
  type VisionMatchSource,
  type VisionRuntimeStatus,
  type VisionSearchMode,
  type VisionSimilarSearchRequest,
  type VisionLibrarySource,
  type VisionSearchResult,
  type VisionEvidence,
  type VisionEvidenceType,
  type VisionDerivedEvidenceType,
  type VisionEvidenceSource,
  type VisionEvidenceSourceAudit,
  type VisionEvidenceAuditPage,
  type VisionEvidenceCounts,
  type VisionEvidenceAuditStatus
} from '../../shared/vision-types'
import type { VisionObjectDetectionBox, VisionObjectDetectionFilterState } from '../../shared/vision-object-detection-types'
import { getVisionSearchRevisionBody, isVisionSearchRevisionUnavailableError, VisionSearchRevisionUnavailableError, VISION_SEARCH_REVISION_SCHEMA_VERSION, type VisionSearchRevision, type VisionSearchTableName } from '../../shared/vision-search-revision'
import type { SpeakerDiarizationEvidenceBatchClearResult, SpeakerDiarizationEvidenceSource } from '../../shared/speaker-diarization-types'
import { addVisionEvidenceCounts, aggregateVisionEvidenceSources, auditVisionEvidenceSource, createEmptyVisionEvidenceCounts, normalizeVisionDerivedEvidenceTypes, normalizeVisionEvidenceAuditStatuses, normalizeVisionEvidenceClearTargets, type VisionEvidenceSourceRow } from './vision-evidence-sources'

const execFileAsync = promisify(execFile)
const TABLE_NAME = 'video_frames'
const SOURCE_TABLE_NAME = 'video_sources'
const CAPTION_TABLE_NAME = 'video_captions'
const SEARCH_DOCUMENT_TABLE_NAME = 'video_search_documents'
const EVIDENCE_TABLE_NAME = 'video_evidence'
const VISION_EVIDENCE_SCHEMA = new Schema([
  new Field('id', new Utf8(), false),
  new Field('source_id', new Utf8(), false),
  new Field('video_path', new Utf8(), false),
  new Field('file_name', new Utf8(), false),
  new Field('evidence_type', new Utf8(), false),
  new Field('start_seconds', new Float64(), false),
  new Field('end_seconds', new Float64(), false),
  new Field('text', new Utf8(), false),
  new Field('frame_id', new Utf8(), false),
  new Field('thumbnail_path', new Utf8(), false),
  new Field('confidence', new Float64(), true),
  new Field('box_xmin', new Float64(), true),
  new Field('box_ymin', new Float64(), true),
  new Field('box_xmax', new Float64(), true),
  new Field('box_ymax', new Float64(), true),
  new Field('source_fingerprint', new Utf8(), false),
  new Field('model_id', new Utf8(), false),
  new Field('model_variant', new Utf8(), false),
  new Field('generated_at', new Float64(), false)
])
const SEARCH_TEXT_COLUMN = 'search_text'
const VECTOR_COLUMN = 'embedding'
const VECTOR_INDEX_NAME = `${VECTOR_COLUMN}_idx`
const VECTOR_INDEX_MAX_PARTITIONS = 256
const VECTOR_INDEX_OPTIMIZE_MIN_UNINDEXED_ROWS = 256
const VECTOR_INDEX_OPTIMIZE_RATIO = 0.05
const METADATA_SCAN_LIMIT = 1_000_000
const VISION_SEARCH_TABLE_NAMES: readonly VisionSearchTableName[] = [TABLE_NAME, SOURCE_TABLE_NAME, CAPTION_TABLE_NAME, SEARCH_DOCUMENT_TABLE_NAME, EVIDENCE_TABLE_NAME]

function throwIfVisionSearchAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('视觉搜索已取消')
  error.name = 'AbortError'
  throw error
}

type VisionFrameRow = {
  id: string
  video_path: string
  file_name: string
  timestamp_seconds: number
  thumbnail_path: string
  embedding: number[]
  model_id: string
  model_variant: string
  file_size_bytes: number
  file_mtime_ms: number
}

type VisionFramePointer = Pick<VisionFrameRow, 'id' | 'video_path' | 'file_name' | 'timestamp_seconds' | 'thumbnail_path'>

type VisionSourceRow = {
  id: string
  video_path: string
  file_name: string
  file_size_bytes: number
  file_mtime_ms: number
  sample_interval_seconds: number
  subtitle_path: string
  subtitle_size_bytes: number
  subtitle_mtime_ms: number
  frame_count: number
  model_id: string
  model_variant: string
  indexed_at_ms: number
}

type VisionCaptionRow = {
  id: string
  video_path: string
  file_name: string
  frame_id: string
  timestamp_seconds: number
  thumbnail_path: string
  start_seconds: number
  end_seconds: number
  text: string
  subtitle_path: string
  subtitle_size_bytes: number
  subtitle_mtime_ms: number
}

type VisionSearchDocumentRow = {
  id: string
  video_path: string
  file_name: string
  frame_id: string
  timestamp_seconds: number
  thumbnail_path: string
  caption_text: string
  search_text: string
}

type VisionEvidenceRow = {
  id: string
  source_id: string
  video_path: string
  file_name: string
  evidence_type: VisionEvidenceType
  start_seconds: number
  end_seconds: number
  text: string
  frame_id: string
  thumbnail_path: string
  confidence: number | null
  box_xmin: number | null
  box_ymin: number | null
  box_xmax: number | null
  box_ymax: number | null
  source_fingerprint: string
  model_id: string
  model_variant: string
  generated_at: number
}

type SubtitleSnapshot = {
  path: string
  sizeBytes: number
  mtimeMs: number
  segments: Array<{ startSeconds: number; endSeconds: number; text: string }>
}

type VideoSourceSnapshot = {
  sizeBytes: number
  mtimeMs: number
  subtitle: SubtitleSnapshot
}

type VisionLibraryOptions = {
  userDataPath: string
  resourcePath: string
  env: NodeJS.ProcessEnv
  getEntityLabels?: () => readonly VisionEntityLabel[] | Promise<readonly VisionEntityLabel[]>
  objectDetectionModelDirectory?: string | null
  objectDetectionRuntime?: Pick<VisionObjectDetectionRuntime, 'getStatus' | 'prepare' | 'detectImage'>
}

type VisionObjectDetectionRuntimeLike = Pick<VisionObjectDetectionRuntime, 'getStatus' | 'prepare' | 'detectImage'>

type ProgressCallback = (progress: VisionIndexProgress) => void

type VisionTimingPhase = Exclude<keyof VisionIndexTimings, 'totalMs'>

const VISION_TIMING_PHASE_BY_STAGE: Partial<Record<VisionIndexStage, VisionTimingPhase>> = {
  planning: 'planningMs',
  'loading-model': 'modelLoadingMs',
  frames: 'framesMs',
  'scene-evidence': 'sceneEvidenceMs',
  'entity-evidence': 'entityEvidenceMs',
  'object-evidence': 'objectEvidenceMs',
  'vector-index': 'vectorIndexMs',
  'text-index': 'textIndexMs'
}

type VisualSearchCandidate = {
  result: VisionSearchResult
  visualRankScore: number
}

type LexicalSearchCandidate = {
  result: VisionSearchResult
  lexicalScore: number
  matchSource: VisionMatchSource
}

function escapeSqlString(value: string): string {
  return value.replaceAll("'", "''")
}

function clampLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 24
  return Math.min(100, Math.max(1, Math.floor(value as number)))
}

function fullSearchCandidateLimit(full: boolean, limit: number): number {
  return full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : Math.min(100, Math.max(clampLimit(limit) * 4, 50))
}

function clampSourceLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) return 100
  return Math.min(500, Math.max(1, Math.floor(value as number)))
}

function clampSourceOffset(value: number | undefined): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.floor(value as number))
}

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function nullableFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function boxFromEvidenceRow(row: { box_xmin?: unknown; box_ymin?: unknown; box_xmax?: unknown; box_ymax?: unknown }): VisionObjectDetectionBox | undefined {
  const box = {
    xmin: nullableFiniteNumber(row.box_xmin),
    ymin: nullableFiniteNumber(row.box_ymin),
    xmax: nullableFiniteNumber(row.box_xmax),
    ymax: nullableFiniteNumber(row.box_ymax)
  }
  if (box.xmin === null || box.ymin === null || box.xmax === null || box.ymax === null) return undefined
  if (box.xmin < 0 || box.ymin < 0 || box.xmax <= box.xmin || box.ymax <= box.ymin) return undefined
  return { xmin: box.xmin, ymin: box.ymin, xmax: box.xmax, ymax: box.ymax }
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('视觉索引已取消')
    error.name = 'AbortError'
    throw error
  }
}

function vectorLength(value: unknown): number {
  const candidate = value as { length?: unknown }
  return typeof candidate?.length === 'number' && Number.isFinite(candidate.length) ? candidate.length : 0
}

function vectorValue(value: unknown, index: number): number {
  const candidate = value as { get?: (index: number) => unknown; [index: number]: unknown }
  const raw = typeof candidate?.get === 'function' ? candidate.get(index) : candidate?.[index]
  return Number(raw)
}

export function dotProduct(left: unknown, right: unknown): number {
  const length = Math.min(vectorLength(left), vectorLength(right))
  let total = 0
  for (let index = 0; index < length; index += 1) {
    const leftValue = vectorValue(left, index)
    const rightValue = vectorValue(right, index)
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) total += leftValue * rightValue
  }
  return total
}

async function probeDuration(ffprobePath: string, videoPath: string): Promise<number> {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'error',
    '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1',
    videoPath
  ], { maxBuffer: 1024 * 1024 })
  const duration = Number(String(stdout).trim())
  return Number.isFinite(duration) && duration > 0 ? duration : 0
}

async function extractJpegFrame(ffmpegPath: string, videoPath: string, timestampSeconds: number): Promise<Buffer> {
  const { stdout } = await execFileAsync(ffmpegPath, [
    '-hide_banner',
    '-loglevel', 'error',
    '-ss', timestampSeconds.toFixed(3),
    '-i', videoPath,
    '-frames:v', '1',
    '-f', 'image2pipe',
    '-vcodec', 'mjpeg',
    '-q:v', '4',
    'pipe:1'
  ], { encoding: 'buffer', maxBuffer: 16 * 1024 * 1024 })
  const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout as unknown as Uint8Array)
  if (buffer.length === 0) throw new Error(`ffmpeg 没有输出视频帧：${basename(videoPath)}`)
  return buffer
}

function getSampleTimestamps(durationSeconds: number, intervalSeconds: number): number[] {
  if (durationSeconds <= 0) return [0]
  const timestamps: number[] = []
  for (let timestamp = 0; timestamp < durationSeconds; timestamp += intervalSeconds) {
    timestamps.push(Number(timestamp.toFixed(3)))
  }
  return timestamps.length > 0 ? timestamps : [0]
}

function createFrameId(videoPath: string, fileMtimeMs: number, timestampSeconds: number): string {
  return createHash('sha1')
    .update(`${videoPath}\0${fileMtimeMs}\0${timestampSeconds}\0${VISION_MODEL_ID}\0${VISION_MODEL_VARIANT}`)
    .digest('hex')
}

function createCaptionId(videoPath: string, segment: { startSeconds: number; endSeconds: number; text: string }, subtitle: SubtitleSnapshot): string {
  return createHash('sha1')
    .update(`${videoPath}\0${subtitle.path}\0${subtitle.mtimeMs}\0${segment.startSeconds}\0${segment.endSeconds}\0${segment.text}`)
    .digest('hex')
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

export function getVisionIndexDirectory(userDataPath: string): string {
  return join(userDataPath, 'library', 'vision')
}

export class VisionLibrary {
  private readonly model: VisionEmbeddingRuntime
  private readonly objectDetection: VisionObjectDetectionRuntimeLike
  private readonly indexDirectory: string
  private readonly thumbnailDirectory: string
  private readonly databaseDirectory: string
  private dbPromise: ReturnType<typeof connect> | null = null
  private searchDocumentMaintenancePromise: Promise<void> | null = null
  private vectorIndexMaintenancePromise: Promise<void> | null = null
  private evidenceSchemaMigrationPromise: Promise<void> | null = null
  private searchDocumentsReady = false
  private entityLabelEmbeddingsPromise: Promise<ReadonlyMap<string, number[]>> | null = null
  private entityLabelEmbeddingsKey = ''

  private readonly options: VisionLibraryOptions

  constructor(options: VisionLibraryOptions) {
    this.options = options
    this.model = new VisionEmbeddingRuntime(options.resourcePath, options.userDataPath)
    this.objectDetection = options.objectDetectionRuntime ?? new VisionObjectDetectionRuntime({
      userDataPath: options.userDataPath,
      modelDirectory: options.objectDetectionModelDirectory
    } satisfies VisionObjectDetectionRuntimeOptions)
    this.indexDirectory = getVisionIndexDirectory(options.userDataPath)
    this.thumbnailDirectory = join(this.indexDirectory, 'thumbnails')
    this.databaseDirectory = join(this.indexDirectory, 'lancedb')
  }

  get modelPaths() {
    return this.model.paths
  }

  private async getDatabase() {
    await ensureDirectory(this.databaseDirectory)
    this.dbPromise ??= connect(this.databaseDirectory)
    return this.dbPromise
  }

  async getSearchRevision(): Promise<VisionSearchRevision> {
    await this.ensureEvidenceTableSchema()
    const db = await this.getDatabase()
    const tableNames = new Set(await db.tableNames())
    const tables = {} as Record<VisionSearchTableName, number | null>
    for (const name of VISION_SEARCH_TABLE_NAMES) {
      if (!tableNames.has(name)) {
        tables[name] = null
        continue
      }
      tables[name] = await (await db.openTable(name)).version()
    }
    const revisionBody = getVisionSearchRevisionBody({ schemaVersion: VISION_SEARCH_REVISION_SCHEMA_VERSION, tables })
    return {
      ...revisionBody,
      fingerprint: createHash('sha256').update(JSON.stringify(revisionBody)).digest('hex')
    }
  }

  private async getTableByName(name: string, revision?: VisionSearchRevision): Promise<Table | null> {
    const db = await this.getDatabase()
    const tableNames = await db.tableNames()
    const pinnedVersion = revision && name in revision.tables ? revision.tables[name as VisionSearchTableName] : undefined
    if (pinnedVersion === null || (!revision && !tableNames.includes(name)) || (revision && pinnedVersion === undefined && !tableNames.includes(name))) return null
    if (pinnedVersion === undefined) return db.openTable(name)
    try {
      const currentTable = await db.openTable(name)
      const versions = await currentTable.listVersions()
      if (!versions.some((entry) => entry.version === pinnedVersion)) throw new VisionSearchRevisionUnavailableError(name as VisionSearchTableName, pinnedVersion)
      return await db.openTable(name, undefined, { version: pinnedVersion })
    } catch (error) {
      if (error instanceof VisionSearchRevisionUnavailableError) throw error
      throw new VisionSearchRevisionUnavailableError(name as VisionSearchTableName, pinnedVersion)
    }
  }

  private async getTable(revision?: VisionSearchRevision): Promise<Table | null> {
    return this.getTableByName(TABLE_NAME, revision)
  }

  private async getSourceTable(revision?: VisionSearchRevision): Promise<Table | null> {
    return this.getTableByName(SOURCE_TABLE_NAME, revision)
  }

  private async getCaptionTable(revision?: VisionSearchRevision): Promise<Table | null> {
    return this.getTableByName(CAPTION_TABLE_NAME, revision)
  }

  private async getSearchDocumentTable(revision?: VisionSearchRevision): Promise<Table | null> {
    return this.getTableByName(SEARCH_DOCUMENT_TABLE_NAME, revision)
  }

  private async migrateEvidenceTableIfNeeded(): Promise<void> {
    const db = await this.getDatabase()
    const tableNames = await db.tableNames()
    if (!tableNames.includes(EVIDENCE_TABLE_NAME)) return
    const table = await db.openTable(EVIDENCE_TABLE_NAME)
    const fields = new Set((await table.schema()).fields.map((field) => field.name))
    const requiredFields = VISION_EVIDENCE_SCHEMA.fields.map((field) => field.name)
    if (requiredFields.every((field) => fields.has(field))) return

    const oldRows = await table.query().limit(METADATA_SCAN_LIMIT).toArray() as unknown as Array<Record<string, unknown>>
    const rows: VisionEvidenceRow[] = oldRows.map((row) => ({
      id: String(row.id ?? ''),
      source_id: String(row.source_id ?? ''),
      video_path: String(row.video_path ?? ''),
      file_name: String(row.file_name ?? ''),
      evidence_type: String(row.evidence_type ?? 'visual') as VisionEvidenceType,
      start_seconds: Number(row.start_seconds ?? 0),
      end_seconds: Number(row.end_seconds ?? 0),
      text: String(row.text ?? ''),
      frame_id: String(row.frame_id ?? ''),
      thumbnail_path: String(row.thumbnail_path ?? ''),
      confidence: nullableFiniteNumber(row.confidence),
      box_xmin: nullableFiniteNumber(row.box_xmin),
      box_ymin: nullableFiniteNumber(row.box_ymin),
      box_xmax: nullableFiniteNumber(row.box_xmax),
      box_ymax: nullableFiniteNumber(row.box_ymax),
      source_fingerprint: String(row.source_fingerprint ?? ''),
      model_id: String(row.model_id ?? 'unknown'),
      model_variant: String(row.model_variant ?? 'unknown'),
      generated_at: Number.isFinite(Number(row.generated_at)) ? Number(row.generated_at) : Date.now()
    }))
    await db.dropTable(EVIDENCE_TABLE_NAME)
    await db.createTable(EVIDENCE_TABLE_NAME, rows, { schema: VISION_EVIDENCE_SCHEMA })
  }

  private async ensureEvidenceTableSchema(): Promise<void> {
    this.evidenceSchemaMigrationPromise ??= this.migrateEvidenceTableIfNeeded().finally(() => { this.evidenceSchemaMigrationPromise = null })
    return this.evidenceSchemaMigrationPromise
  }

  private async getEvidenceTable(revision?: VisionSearchRevision): Promise<Table | null> {
    if (revision) return this.getTableByName(EVIDENCE_TABLE_NAME, revision)
    await this.ensureEvidenceTableSchema()
    return this.getTableByName(EVIDENCE_TABLE_NAME)
  }

  private async countRows(): Promise<number> {
    const table = await this.getTable()
    if (!table) return 0
    const rows = await table.query().select(['id']).limit(METADATA_SCAN_LIMIT).toArray()
    return rows.length
  }

  private async countIndexedVideos(): Promise<number> {
    const sourceTable = await this.getSourceTable()
    if (sourceTable) {
      const rows = await sourceTable.query().select(['video_path']).limit(METADATA_SCAN_LIMIT).toArray()
      return new Set(rows.map((row) => String((row as Record<string, unknown>).video_path))).size
    }
    const frameTable = await this.getTable()
    if (!frameTable) return 0
    const rows = await frameTable.query().select(['video_path']).limit(METADATA_SCAN_LIMIT).toArray()
    return new Set(rows.map((row) => String((row as Record<string, unknown>).video_path))).size
  }

  async getStatus(): Promise<VisionRuntimeStatus> {
    const available = this.model.isAvailable()
    const vectorIndex = await this.getVectorIndexStatus()
    // Do not make opening the panel wait for IVF training. Search and indexing
    // share the same promise, so a concurrent operation still waits for it.
    void this.ensureVectorIndex(false).catch(() => undefined)
    return {
      available,
      downloadable: true,
      modelId: VISION_MODEL_ID,
      modelVariant: VISION_MODEL_VARIANT,
      modelDirectory: this.model.paths.modelDirectory,
      indexDirectory: this.indexDirectory,
      indexedFrameCount: await this.countRows(),
      indexedVideoCount: await this.countIndexedVideos(),
      ...vectorIndex,
      message: this.model.getStatusMessage()
    }
  }

  async listSources(limit?: number, offset?: number): Promise<VisionLibrarySource[]> {
    const sourceLimit = clampSourceLimit(limit)
    const sourceOffset = clampSourceOffset(offset)
    const sourceTable = await this.getSourceTable()
    if (sourceTable) {
      const rows = await sourceTable.query()
        .select(['id', 'video_path', 'file_name', 'file_size_bytes', 'file_mtime_ms', 'subtitle_path', 'frame_count', 'indexed_at_ms'])
        .limit(METADATA_SCAN_LIMIT)
        .toArray() as unknown as VisionSourceRow[]
      const selectedRows = rows
        .sort((left, right) => right.indexed_at_ms - left.indexed_at_ms || left.file_name.localeCompare(right.file_name, undefined, { sensitivity: 'base', numeric: true }))
        .slice(sourceOffset, sourceOffset + sourceLimit)
      const sources = await Promise.all(selectedRows.map(async (row): Promise<VisionLibrarySource> => {
        const frame = (await this.getFramePointers(row.video_path))[0]
        return {
          sourceId: row.id,
          videoPath: row.video_path,
          fileName: row.file_name,
          fileSizeBytes: row.file_size_bytes,
          fileMtimeMs: row.file_mtime_ms,
          frameCount: row.frame_count,
          indexedAtMs: row.indexed_at_ms,
          subtitlePath: row.subtitle_path || null,
          thumbnailPath: frame?.thumbnail_path || null,
          metadata: null
        }
      }))
      return sources
    }

    const pointers = await this.getAllFramePointers()
    const grouped = new Map<string, VisionFramePointer[]>()
    for (const pointer of pointers) {
      const frames = grouped.get(pointer.video_path) ?? []
      frames.push(pointer)
      grouped.set(pointer.video_path, frames)
    }
    return [...grouped.entries()]
      .sort(([left], [right]) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
      .slice(sourceOffset, sourceOffset + sourceLimit)
      .map(([videoPath, frames]) => ({
        sourceId: createHash('sha1').update(videoPath).digest('hex'),
        videoPath,
        fileName: frames[0]?.file_name ?? basename(videoPath),
        fileSizeBytes: 0,
        fileMtimeMs: 0,
        frameCount: frames.length,
        indexedAtMs: 0,
        subtitlePath: null,
        thumbnailPath: frames[0]?.thumbnail_path || null,
        metadata: null
      }))
  }

  private async getVectorIndex(): Promise<{ name: string; columns: string[]; indexType: string } | null> {
    const table = await this.getTable()
    if (!table) return null
    const index = (await table.listIndices()).find((candidate) => candidate.name === VECTOR_INDEX_NAME || candidate.columns.includes(VECTOR_COLUMN))
    return index ? { name: index.name, columns: index.columns, indexType: index.indexType } : null
  }

  private async getVectorIndexStatus(): Promise<Pick<VisionRuntimeStatus, 'vectorIndexType' | 'vectorIndexDistanceType' | 'vectorIndexIndexedRows' | 'vectorIndexUnindexedRows'>> {
    const table = await this.getTable()
    if (!table) return { vectorIndexType: null, vectorIndexDistanceType: null, vectorIndexIndexedRows: 0, vectorIndexUnindexedRows: 0 }
    const index = (await table.listIndices()).find((candidate) => candidate.name === VECTOR_INDEX_NAME || candidate.columns.includes(VECTOR_COLUMN))
    if (!index) return { vectorIndexType: null, vectorIndexDistanceType: null, vectorIndexIndexedRows: 0, vectorIndexUnindexedRows: 0 }
    const stats = await table.indexStats(index.name)
    return {
      vectorIndexType: stats?.indexType ?? index.indexType,
      vectorIndexDistanceType: stats?.distanceType ?? null,
      vectorIndexIndexedRows: stats?.numIndexedRows ?? index.numIndexedRows ?? 0,
      vectorIndexUnindexedRows: stats?.numUnindexedRows ?? index.numUnindexedRows ?? 0
    }
  }

  private async getSubtitleSnapshot(videoPath: string, preferredSubtitlePath?: string): Promise<SubtitleSnapshot> {
    const extension = extname(videoPath)
    const basePath = videoPath.slice(0, videoPath.length - extension.length)
    const sidecarPaths = [`${basePath}.vtt`, `${basePath}.srt`]
    const subtitlePaths = preferredSubtitlePath
      ? [preferredSubtitlePath, ...sidecarPaths.filter((path) => path !== preferredSubtitlePath)]
      : sidecarPaths
    for (const subtitlePath of subtitlePaths) {
      try {
        const subtitleFile = await stat(subtitlePath)
        if (!subtitleFile.isFile()) continue
        const text = await readFile(subtitlePath, 'utf8')
        return {
          path: subtitlePath,
          sizeBytes: subtitleFile.size,
          mtimeMs: subtitleFile.mtimeMs,
          segments: parseVtt(text)
        }
      } catch {
        // A missing or unreadable sidecar is treated as no subtitle so one bad
        // sidecar does not prevent the visual index from being usable.
      }
    }
    return { path: '', sizeBytes: 0, mtimeMs: 0, segments: [] }
  }

  private async getVideoSourceSnapshot(videoPath: string, preferredSubtitlePath?: string): Promise<VideoSourceSnapshot> {
    const file = await stat(videoPath)
    if (!file.isFile()) throw new Error(`视频路径不是有效文件：${videoPath}`)
    return {
      sizeBytes: file.size,
      mtimeMs: file.mtimeMs,
      subtitle: await this.getSubtitleSnapshot(videoPath, preferredSubtitlePath)
    }
  }

  private async getSourceRow(videoPath: string): Promise<VisionSourceRow | null> {
    const table = await this.getSourceTable()
    if (!table) return null
    const rows = await table.query()
      .where(`video_path = '${escapeSqlString(videoPath)}'`)
      .select(['id', 'video_path', 'file_name', 'file_size_bytes', 'file_mtime_ms', 'sample_interval_seconds', 'subtitle_path', 'subtitle_size_bytes', 'subtitle_mtime_ms', 'frame_count', 'model_id', 'model_variant', 'indexed_at_ms'])
      .limit(1)
      .toArray()
    return (rows[0] as VisionSourceRow | undefined) ?? null
  }

  private isVideoSourceUnchanged(source: VisionSourceRow, snapshot: VideoSourceSnapshot, intervalSeconds: number): boolean {
    return source.file_size_bytes === snapshot.sizeBytes
      && source.file_mtime_ms === snapshot.mtimeMs
      && source.sample_interval_seconds === intervalSeconds
      && source.model_id === VISION_MODEL_ID
      && source.model_variant === VISION_MODEL_VARIANT
  }

  private isSubtitleUnchanged(source: VisionSourceRow, subtitle: SubtitleSnapshot): boolean {
    return source.subtitle_path === subtitle.path
      && source.subtitle_size_bytes === subtitle.sizeBytes
      && source.subtitle_mtime_ms === subtitle.mtimeMs
  }

  private async replaceVideoRows(videoPath: string, rows: VisionFrameRow[]): Promise<void> {
    const db = await this.getDatabase()
    const existing = await this.getTable()
    if (existing) await existing.delete(`video_path = '${escapeSqlString(videoPath)}'`)
    if (rows.length === 0) return
    if (existing) {
      await existing.add(rows)
      return
    }
    await db.createTable(TABLE_NAME, rows)
  }

  private async replaceCaptionRows(videoPath: string, rows: VisionCaptionRow[]): Promise<void> {
    const db = await this.getDatabase()
    const existing = await this.getCaptionTable()
    if (existing) await existing.delete(`video_path = '${escapeSqlString(videoPath)}'`)
    if (rows.length === 0) return
    if (existing) {
      await existing.add(rows)
      return
    }
    await db.createTable(CAPTION_TABLE_NAME, rows)
  }

  private buildSearchDocumentRows(framePointers: VisionFramePointer[], captionRows: VisionCaptionRow[]): VisionSearchDocumentRow[] {
    const captionsByFrame = new Map<string, string[]>()
    for (const caption of captionRows) {
      const captions = captionsByFrame.get(caption.frame_id) ?? []
      captions.push(caption.text)
      captionsByFrame.set(caption.frame_id, captions)
    }
    return framePointers.map((frame) => {
      const captionText = (captionsByFrame.get(frame.id) ?? []).join('\n')
      return {
        id: frame.id,
        video_path: frame.video_path,
        file_name: frame.file_name,
        frame_id: frame.id,
        timestamp_seconds: frame.timestamp_seconds,
        thumbnail_path: frame.thumbnail_path,
        caption_text: captionText,
        search_text: [frame.file_name, captionText].filter(Boolean).join('\n')
      }
    })
  }

  private async replaceSearchDocumentRows(videoPath: string, rows: VisionSearchDocumentRow[]): Promise<void> {
    const db = await this.getDatabase()
    const existing = await this.getSearchDocumentTable()
    if (existing) await existing.delete(`video_path = '${escapeSqlString(videoPath)}'`)
    if (rows.length === 0) return
    if (existing) {
      await existing.add(rows)
      return
    }
    await db.createTable(SEARCH_DOCUMENT_TABLE_NAME, rows)
  }

  private async replaceEvidenceRows(videoPath: string, rows: VisionEvidenceRow[], sourceFingerprint: string): Promise<void> {
    const db = await this.getDatabase()
    const existing = await this.getEvidenceTable()
    const preservedRows = existing
      ? (await existing.query().where(`video_path = '${escapeSqlString(videoPath)}'`).toArray() as unknown as VisionEvidenceRow[])
        .filter((row) => row.evidence_type !== 'subtitle' && row.evidence_type !== 'visual' && row.source_fingerprint === sourceFingerprint)
      : []
    const nextRows = [...preservedRows, ...rows]
    if (existing) await existing.delete(`video_path = '${escapeSqlString(videoPath)}'`)
    if (nextRows.length === 0) return
    if (existing) {
      await existing.add(nextRows)
      return
    }
    await db.createTable(EVIDENCE_TABLE_NAME, nextRows, { schema: VISION_EVIDENCE_SCHEMA })
  }

  private async replaceSceneEvidenceRows(videoPath: string, rows: VisionEvidenceRow[]): Promise<void> {
    await this.replaceEvidenceTypeRows(videoPath, 'scene', rows)
  }

  private async replaceEntityEvidenceRows(videoPath: string, rows: VisionEvidenceRow[]): Promise<void> {
    await this.replaceEvidenceTypeRows(videoPath, 'entity', rows)
  }

  private async replaceEvidenceTypeRows(videoPath: string, evidenceType: VisionEvidenceType, rows: VisionEvidenceRow[]): Promise<void> {
    const db = await this.getDatabase()
    const existing = await this.getEvidenceTable()
    const preservedRows = existing
      ? (await existing.query().where(`video_path = '${escapeSqlString(videoPath)}'`).toArray() as unknown as VisionEvidenceRow[])
        .filter((row) => row.evidence_type !== evidenceType)
      : []
    const nextRows = [...preservedRows, ...rows]
    if (existing) await existing.delete(`video_path = '${escapeSqlString(videoPath)}'`)
    if (nextRows.length === 0) return
    if (existing) {
      await existing.add(nextRows)
      return
    }
    await db.createTable(EVIDENCE_TABLE_NAME, nextRows, { schema: VISION_EVIDENCE_SCHEMA })
  }

  private toEvidenceRow(evidence: VisionEvidence): VisionEvidenceRow {
    return {
      id: evidence.id,
      source_id: evidence.sourceId,
      video_path: evidence.videoPath,
      file_name: evidence.fileName,
      evidence_type: evidence.evidenceType,
      start_seconds: evidence.startSeconds,
      end_seconds: evidence.endSeconds,
      text: evidence.text?.trim() ?? '',
      frame_id: evidence.frameId?.trim() ?? '',
      thumbnail_path: evidence.thumbnailPath?.trim() ?? '',
      confidence: evidence.confidence !== undefined && Number.isFinite(evidence.confidence) ? evidence.confidence : null,
      box_xmin: nullableFiniteNumber(evidence.box?.xmin),
      box_ymin: nullableFiniteNumber(evidence.box?.ymin),
      box_xmax: nullableFiniteNumber(evidence.box?.xmax),
      box_ymax: nullableFiniteNumber(evidence.box?.ymax),
      source_fingerprint: evidence.sourceFingerprint?.trim() ?? '',
      model_id: evidence.modelId?.trim() || 'unknown',
      model_variant: evidence.modelVariant?.trim() || 'unknown',
      generated_at: evidence.generatedAt !== undefined && Number.isFinite(evidence.generatedAt) ? evidence.generatedAt : Date.now()
    }
  }

  /** Adds one derived evidence row without replacing subtitle or visual evidence for the source. */
  async upsertEvidence(evidence: VisionEvidence): Promise<void> {
    const row = this.toEvidenceRow(evidence)
    const db = await this.getDatabase()
    const existing = await this.getEvidenceTable()
    if (existing) {
      await existing.delete(`id = '${escapeSqlString(row.id)}'`)
      await existing.add([row])
      return
    }
    await db.createTable(EVIDENCE_TABLE_NAME, [row], { schema: VISION_EVIDENCE_SCHEMA })
  }

  /** Replaces only speaker evidence for one source while preserving other evidence types. */
  async replaceSpeakerEvidence(videoPath: string, evidence: readonly VisionEvidence[]): Promise<void> {
    await this.replaceEvidenceTypeRows(videoPath, 'speaker', evidence.map((item) => this.toEvidenceRow(item)))
  }

  /** Replaces only object detection evidence for one source while preserving other evidence types. */
  async replaceObjectEvidenceRows(videoPath: string, evidence: readonly VisionEvidence[]): Promise<void> {
    await this.replaceEvidenceTypeRows(videoPath, 'object', evidence.map((item) => this.toEvidenceRow(item)))
  }

  async listEvidenceSources(limit?: number, offset?: number, evidenceTypes?: readonly VisionDerivedEvidenceType[]): Promise<VisionEvidenceSource[]> {
    const table = await this.getEvidenceTable()
    if (!table) return []
    const rows = await table.query()
      .select(['video_path', 'file_name', 'evidence_type', 'source_fingerprint', 'generated_at'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray() as unknown as Array<Record<string, unknown>>
    const sourceRows: VisionEvidenceSourceRow[] = rows.map((row) => ({
      videoPath: row.video_path,
      fileName: row.file_name,
      evidenceType: row.evidence_type,
      sourceFingerprint: row.source_fingerprint,
      generatedAt: row.generated_at
    }))
    const sourceLimit = clampSourceLimit(limit)
    const sourceOffset = clampSourceOffset(offset)
    return aggregateVisionEvidenceSources(sourceRows, evidenceTypes).slice(sourceOffset, sourceOffset + sourceLimit)
  }

  /** Audits derived evidence sources without deleting or rewriting any data. */
  async auditEvidenceSources(limit?: number, offset?: number, evidenceTypes?: readonly VisionDerivedEvidenceType[], auditStatuses?: readonly VisionEvidenceAuditStatus[]): Promise<VisionEvidenceAuditPage> {
    const selectedStatuses = new Set(normalizeVisionEvidenceAuditStatuses(auditStatuses, true))
    const sourceLimit = clampSourceLimit(limit)
    const sourceOffset = clampSourceOffset(offset)
    const targetEnd = sourceOffset + sourceLimit
    const scanPageLimit = 500
    const matches: VisionEvidenceSourceAudit[] = []
    let scanOffset = 0
    let exhausted = false
    while (!exhausted && matches.length <= targetEnd) {
      const sources = await this.listEvidenceSources(scanPageLimit, scanOffset, evidenceTypes)
      if (sources.length === 0) break
      const audited = await Promise.all(sources.map(async (source) => {
        try {
          const snapshot = await stat(source.videoPath)
          return auditVisionEvidenceSource(source, createVisionSourceFingerprint(source.videoPath, snapshot.size, snapshot.mtimeMs))
        } catch (error) {
          const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : ''
          return auditVisionEvidenceSource(source, code === 'ENOENT' || code === 'ENOTDIR' ? null : undefined)
        }
      }))
      matches.push(...audited.filter((source) => selectedStatuses.has(source.auditStatus)))
      scanOffset += sources.length
      exhausted = sources.length < scanPageLimit
    }
    return {
      sources: matches.slice(sourceOffset, targetEnd),
      offset: sourceOffset,
      limit: sourceLimit,
      hasMore: matches.length > targetEnd
    }
  }

  private async clearEvidenceTypes(videoPath: string, evidenceTypes: readonly VisionDerivedEvidenceType[]): Promise<VisionEvidenceCounts> {
    const counts = createEmptyVisionEvidenceCounts()
    const selected = new Set(normalizeVisionDerivedEvidenceTypes(evidenceTypes))
    if (!videoPath || selected.size === 0) return counts
    const table = await this.getEvidenceTable()
    if (!table) return counts
    const rows = await table.query()
      .where(`video_path = '${escapeSqlString(videoPath)}'`)
      .limit(METADATA_SCAN_LIMIT)
      .toArray() as unknown as VisionEvidenceRow[]
    const preservedRows = rows.filter((row) => {
      const evidenceType = typeof row.evidence_type === 'string' ? row.evidence_type as VisionDerivedEvidenceType : null
      if (!evidenceType || !selected.has(evidenceType)) return true
      counts[evidenceType] += 1
      return false
    })
    const removedCount = Object.values(counts).reduce((total, count) => total + count, 0)
    if (removedCount === 0) return counts
    await table.delete(`video_path = '${escapeSqlString(videoPath)}'`)
    if (preservedRows.length > 0) await table.add(preservedRows)
    return counts
  }

  async clearEvidenceBatch(value: unknown): Promise<{ clearedSources: number; clearedEvidenceCount: number; clearedByType: VisionEvidenceCounts }> {
    const targets = normalizeVisionEvidenceClearTargets(value)
    const clearedByType = createEmptyVisionEvidenceCounts()
    if (targets.length === 0) return { clearedSources: 0, clearedEvidenceCount: 0, clearedByType }
    let clearedSources = 0
    for (const target of targets) {
      const counts = await this.clearEvidenceTypes(target.videoPath, target.evidenceTypes)
      const clearedCount = Object.values(counts).reduce((total, count) => total + count, 0)
      if (clearedCount === 0) continue
      clearedSources += 1
      addVisionEvidenceCounts(clearedByType, counts)
    }
    return {
      clearedSources,
      clearedEvidenceCount: Object.values(clearedByType).reduce((total, count) => total + count, 0),
      clearedByType
    }
  }

  /** Removes only speaker evidence for one source while preserving all other evidence types. */
  async clearSpeakerEvidence(videoPath: string): Promise<void> {
    await this.replaceEvidenceTypeRows(videoPath, 'speaker', [])
  }

  async listSpeakerEvidenceSources(limit?: number, offset?: number): Promise<SpeakerDiarizationEvidenceSource[]> {
    const table = await this.getEvidenceTable()
    if (!table) return []
    const rows = await table.query()
      .select(['video_path', 'file_name', 'evidence_type', 'source_fingerprint', 'generated_at'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray() as unknown as Array<Record<string, unknown>>
    const grouped = new Map<string, SpeakerDiarizationEvidenceSource>()
    for (const row of rows) {
      if (String(row.evidence_type) !== 'speaker') continue
      const videoPath = String(row.video_path ?? '').trim()
      if (!videoPath) continue
      const sourceFingerprint = String(row.source_fingerprint ?? '').trim()
      const key = `${videoPath}\0${sourceFingerprint}`
      const generatedAt = Number(row.generated_at)
      const current = grouped.get(key)
      if (current) {
        current.evidenceCount += 1
        if (Number.isFinite(generatedAt)) current.generatedAt = Math.max(current.generatedAt, generatedAt)
        continue
      }
      grouped.set(key, {
        videoPath,
        fileName: String(row.file_name ?? '').trim() || basename(videoPath),
        sourceFingerprint,
        evidenceCount: 1,
        generatedAt: Number.isFinite(generatedAt) ? generatedAt : 0
      })
    }
    const sourceLimit = clampSourceLimit(limit)
    const sourceOffset = clampSourceOffset(offset)
    return [...grouped.values()]
      .sort((left, right) => right.generatedAt - left.generatedAt || left.fileName.localeCompare(right.fileName, undefined, { sensitivity: 'base', numeric: true }))
      .slice(sourceOffset, sourceOffset + sourceLimit)
  }

  async clearSpeakerEvidenceBatch(videoPaths: readonly string[]): Promise<SpeakerDiarizationEvidenceBatchClearResult> {
    const paths = [...new Set(videoPaths.filter((path): path is string => typeof path === 'string').map((path) => path.trim()).filter(Boolean))]
    if (paths.length === 0) return { success: false, message: '说话人证据清理列表为空', clearedSources: 0, clearedEvidenceCount: 0 }
    const table = await this.getEvidenceTable()
    if (!table) return { success: true, message: '没有可清理的说话人证据', clearedSources: 0, clearedEvidenceCount: 0 }
    const rows = await table.query()
      .select(['video_path', 'evidence_type'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray() as unknown as Array<Record<string, unknown>>
    const countByPath = new Map(paths.map((path) => [path, 0]))
    for (const row of rows) {
      const path = String(row.video_path ?? '').trim()
      if (String(row.evidence_type) === 'speaker' && countByPath.has(path)) countByPath.set(path, (countByPath.get(path) ?? 0) + 1)
    }
    let clearedSources = 0
    let clearedEvidenceCount = 0
    for (const path of paths) {
      const evidenceCount = countByPath.get(path) ?? 0
      if (evidenceCount === 0) continue
      await this.clearSpeakerEvidence(path)
      clearedSources += 1
      clearedEvidenceCount += evidenceCount
    }
    return {
      success: true,
      message: clearedSources > 0 ? `已清理 ${clearedSources} 个视频的 ${clearedEvidenceCount} 条说话人证据` : '没有可清理的说话人证据',
      clearedSources,
      clearedEvidenceCount
    }
  }

  private async getAllFramePointers(revision?: VisionSearchRevision): Promise<VisionFramePointer[]> {
    const table = await this.getTable(revision)
    if (!table) return []
    const rows = await table.query()
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray()
    return rows as unknown as VisionFramePointer[]
  }

  private async getAllCaptionRows(revision?: VisionSearchRevision): Promise<VisionCaptionRow[]> {
    const table = await this.getCaptionTable(revision)
    if (!table) return []
    const rows = await table.query()
      .select(['id', 'video_path', 'file_name', 'frame_id', 'timestamp_seconds', 'thumbnail_path', 'start_seconds', 'end_seconds', 'text', 'subtitle_path', 'subtitle_size_bytes', 'subtitle_mtime_ms'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray()
    return rows as unknown as VisionCaptionRow[]
  }

  private async rebuildSearchDocuments(): Promise<Table | null> {
    const framePointers = await this.getAllFramePointers()
    if (framePointers.length === 0) return null
    const captionRows = await this.getAllCaptionRows()
    const searchRows = this.buildSearchDocumentRows(framePointers, captionRows)
    const db = await this.getDatabase()
    const existing = await this.getSearchDocumentTable()
    if (existing) {
      await existing.delete("video_path != ''")
      if (searchRows.length > 0) await existing.add(searchRows)
      return existing
    }
    await db.createTable(SEARCH_DOCUMENT_TABLE_NAME, searchRows)
    return this.getSearchDocumentTable()
  }

  private async maintainSearchFullTextIndex(): Promise<void> {
    if (this.searchDocumentMaintenancePromise) return this.searchDocumentMaintenancePromise
    this.searchDocumentMaintenancePromise = (async () => {
      const table = await this.getSearchDocumentTable()
      if (!table) return
      const indices = await table.listIndices()
      const existing = indices.find((index) => index.name === `${SEARCH_TEXT_COLUMN}_idx` && index.indexType === 'FTS')
      if (!existing) {
        await table.createIndex(SEARCH_TEXT_COLUMN, {
          config: Index.fts({
            baseTokenizer: 'ngram',
            ngramMinLength: 1,
            ngramMaxLength: 2,
            withPosition: true,
            lowercase: true,
            stem: false,
            removeStopWords: false,
            asciiFolding: false
          }),
          waitTimeoutSeconds: 60
        })
        return
      }
      const stats = await table.indexStats(existing.name)
      if (stats?.numUnindexedRows && stats.numUnindexedRows > 0) await table.optimize()
    })().finally(() => { this.searchDocumentMaintenancePromise = null })
    return this.searchDocumentMaintenancePromise
  }

  private async maintainVectorIndex(shouldOptimize: boolean): Promise<void> {
    const table = await this.getTable()
    if (!table) return
    let vectorIndex = await this.getVectorIndex()
    if (vectorIndex) {
      const stats = await table.indexStats(vectorIndex.name)
      const isCompatible = stats?.indexType === VISION_VECTOR_INDEX_TYPE && stats.distanceType?.toLowerCase() === VISION_VECTOR_DISTANCE_TYPE
      if (!isCompatible) {
        await table.dropIndex(vectorIndex.name)
        await table.optimize()
        vectorIndex = null
      } else if (shouldOptimize) {
        const unindexedRows = stats?.numUnindexedRows ?? 0
        const indexedRows = stats?.numIndexedRows ?? 0
        const optimizeThreshold = Math.max(VECTOR_INDEX_OPTIMIZE_MIN_UNINDEXED_ROWS, Math.ceil(indexedRows * VECTOR_INDEX_OPTIMIZE_RATIO))
        if (unindexedRows >= optimizeThreshold) await table.optimize()
        return
      } else {
        return
      }
    }

    const rowCount = await table.countRows()
    if (rowCount < VISION_VECTOR_INDEX_MIN_ROWS) return
    const numPartitions = Math.max(16, Math.min(VECTOR_INDEX_MAX_PARTITIONS, Math.round(Math.sqrt(rowCount) / 4)))
    await table.createIndex(VECTOR_COLUMN, {
      config: Index.ivfFlat({ distanceType: VISION_VECTOR_DISTANCE_TYPE, numPartitions }),
      waitTimeoutSeconds: 300
    })
  }

  private async ensureVectorIndex(shouldOptimize: boolean): Promise<void> {
    this.vectorIndexMaintenancePromise ??= this.maintainVectorIndex(shouldOptimize).finally(() => { this.vectorIndexMaintenancePromise = null })
    return this.vectorIndexMaintenancePromise
  }

  private async ensureSearchDocuments(revision?: VisionSearchRevision): Promise<Table | null> {
    if (!revision && this.searchDocumentsReady) return this.getSearchDocumentTable()
    let table = await this.getSearchDocumentTable(revision)
    const framePointers = await this.getAllFramePointers(revision)
    if (framePointers.length === 0) return null
    if (!table && !revision) {
      table = await this.rebuildSearchDocuments()
    } else if (table && !revision) {
      const rows = await table.query().select(['id']).limit(METADATA_SCAN_LIMIT).toArray()
      if (rows.length < framePointers.length) table = await this.rebuildSearchDocuments()
    }
    if (!revision) {
      await this.maintainSearchFullTextIndex()
      this.searchDocumentsReady = table !== null
    }
    return table
  }

  private async upsertSourceRow(row: VisionSourceRow): Promise<void> {
    const db = await this.getDatabase()
    const existing = await this.getSourceTable()
    if (existing) {
      await existing.delete(`video_path = '${escapeSqlString(row.video_path)}'`)
      await existing.add([row])
      return
    }
    await db.createTable(SOURCE_TABLE_NAME, [row])
  }

  private async getFramePointers(videoPath: string): Promise<VisionFramePointer[]> {
    const table = await this.getTable()
    if (!table) return []
    const rows = await table.query()
      .where(`video_path = '${escapeSqlString(videoPath)}'`)
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray()
    return rows as unknown as VisionFramePointer[]
  }

  private async getFrameRows(videoPath: string): Promise<VisionFrameRow[]> {
    const table = await this.getTable()
    if (!table) return []
    const rows = await table.query()
      .where(`video_path = '${escapeSqlString(videoPath)}'`)
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'embedding', 'model_id', 'model_variant', 'file_size_bytes', 'file_mtime_ms'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray()
    return rows as unknown as VisionFrameRow[]
  }

  private buildCaptionRows(videoPath: string, subtitle: SubtitleSnapshot, framePointers: VisionFramePointer[]): VisionCaptionRow[] {
    if (subtitle.segments.length === 0 || framePointers.length === 0) return []
    const fileName = basename(videoPath)
    return subtitle.segments
      .filter((segment) => segment.text.trim().length > 0)
      .map((segment) => {
        const frame = framePointers.reduce((closest, candidate) => {
          const closestDistance = Math.abs(closest.timestamp_seconds - segment.startSeconds)
          const candidateDistance = Math.abs(candidate.timestamp_seconds - segment.startSeconds)
          return candidateDistance < closestDistance ? candidate : closest
        })
        return {
          id: createCaptionId(videoPath, segment, subtitle),
          video_path: videoPath,
          file_name: fileName,
          frame_id: frame.id,
          timestamp_seconds: frame.timestamp_seconds,
          thumbnail_path: frame.thumbnail_path,
          start_seconds: segment.startSeconds,
          end_seconds: segment.endSeconds,
          text: segment.text.trim(),
          subtitle_path: subtitle.path,
          subtitle_size_bytes: subtitle.sizeBytes,
          subtitle_mtime_ms: subtitle.mtimeMs
        }
      })
  }

  private buildEvidenceRows(
    videoPath: string,
    snapshot: VideoSourceSnapshot,
    intervalSeconds: number,
    framePointers: VisionFramePointer[],
    captionRows: VisionCaptionRow[]
  ): VisionEvidenceRow[] {
    const sourceId = createVisionSourceId(videoPath)
    const sourceFingerprint = createVisionSourceFingerprint(videoPath, snapshot.sizeBytes, snapshot.mtimeMs)
    const generatedAt = Date.now()
    const subtitleRows = captionRows.map((caption): VisionEvidenceRow => ({
      id: createVisionEvidenceId({
        videoPath,
        evidenceType: 'subtitle',
        startSeconds: caption.start_seconds,
        endSeconds: caption.end_seconds,
        text: caption.text,
        sourceFingerprint
      }),
      source_id: sourceId,
      video_path: videoPath,
      file_name: caption.file_name,
      evidence_type: 'subtitle',
      start_seconds: caption.start_seconds,
      end_seconds: caption.end_seconds,
      text: caption.text,
      frame_id: caption.frame_id,
      thumbnail_path: caption.thumbnail_path,
      confidence: null,
      box_xmin: null,
      box_ymin: null,
      box_xmax: null,
      box_ymax: null,
      source_fingerprint: sourceFingerprint,
      model_id: 'subtitle-parser',
      model_variant: 'v1',
      generated_at: generatedAt
    }))
    const visualRows = framePointers.map((frame): VisionEvidenceRow => {
      const startSeconds = Math.max(0, frame.timestamp_seconds - intervalSeconds / 2)
      const endSeconds = Math.max(startSeconds + 0.001, frame.timestamp_seconds + intervalSeconds / 2)
      return {
        id: createVisionEvidenceId({ videoPath, evidenceType: 'visual', startSeconds, endSeconds, sourceFingerprint }),
        source_id: sourceId,
        video_path: videoPath,
        file_name: frame.file_name,
        evidence_type: 'visual',
        start_seconds: Number(startSeconds.toFixed(3)),
        end_seconds: Number(endSeconds.toFixed(3)),
        text: '',
        frame_id: frame.id,
        thumbnail_path: frame.thumbnail_path,
        confidence: null,
        box_xmin: null,
        box_ymin: null,
        box_xmax: null,
        box_ymax: null,
        source_fingerprint: sourceFingerprint,
        model_id: VISION_MODEL_ID,
        model_variant: VISION_MODEL_VARIANT,
        generated_at: generatedAt
      }
    })
    return [...subtitleRows, ...visualRows]
  }

  private async refreshSceneEvidence(
    videoPath: string,
    snapshot: VideoSourceSnapshot,
    durationSeconds: number,
    ffmpegPath: string,
    framePointers: VisionFramePointer[],
    signal: AbortSignal
  ): Promise<number> {
    throwIfAborted(signal)
    const cuts = await detectSceneCutTimestamps(
      ffmpegPath,
      videoPath,
      DEFAULT_SCENE_DETECTION_THRESHOLD,
      DEFAULT_MIN_SCENE_DURATION_SECONDS,
      signal
    )
    const sourceFingerprint = createVisionSourceFingerprint(videoPath, snapshot.sizeBytes, snapshot.mtimeMs)
    const rows = createVisionSceneEvidence({
      sourceId: createVisionSourceId(videoPath),
      videoPath,
      fileName: basename(videoPath),
      sourceFingerprint,
      durationSeconds,
      cutTimestamps: cuts,
      frames: framePointers.map((frame) => ({ id: frame.id, timestampSeconds: frame.timestamp_seconds, thumbnailPath: frame.thumbnail_path }))
    }).map((evidence) => this.toEvidenceRow(evidence))
    await this.replaceSceneEvidenceRows(videoPath, rows)
    return rows.length
  }

  private async getEntityLabels(): Promise<readonly VisionEntityLabel[]> {
    const labels = this.options.getEntityLabels ? await this.options.getEntityLabels() : DEFAULT_VISION_ENTITY_LABELS
    return labels.filter((label): label is VisionEntityLabel => Boolean(label && typeof label.id === 'string' && label.id.trim() && typeof label.query === 'string' && label.query.trim() && typeof label.displayName === 'string' && label.displayName.trim())).slice(0, 100)
  }

  private async getEntityLabelEmbeddings(labels: readonly VisionEntityLabel[]): Promise<ReadonlyMap<string, number[]>> {
    const cacheKey = labels.map((label) => `${label.id}\0${label.query}\0${label.displayName}`).join('\0')
    if (this.entityLabelEmbeddingsKey !== cacheKey) {
      this.entityLabelEmbeddingsKey = cacheKey
      this.entityLabelEmbeddingsPromise = null
    }
    this.entityLabelEmbeddingsPromise ??= (async () => {
      await this.model.prepareTextModel()
      const entries = await Promise.all(labels.map(async (label) => [label.id, await this.model.getTextEmbedding(label.query)] as const))
      return new Map(entries)
    })().catch((error) => {
      this.entityLabelEmbeddingsPromise = null
      throw error
    })
    return this.entityLabelEmbeddingsPromise
  }

  private async refreshEntityEvidence(
    videoPath: string,
    snapshot: VideoSourceSnapshot,
    intervalSeconds: number,
    frameRows: VisionFrameRow[],
    labels: readonly VisionEntityLabel[],
    labelEmbeddings: ReadonlyMap<string, number[]>,
    signal: AbortSignal
  ): Promise<number> {
    throwIfAborted(signal)
    const labelsById = new Map<string, VisionEntityLabel>(labels.map((label) => [label.id, label]))
    const sourceFingerprint = createVisionSourceFingerprint(videoPath, snapshot.sizeBytes, snapshot.mtimeMs)
    const rows = frameRows.flatMap((frame) => createVisionEntityEvidence({
      sourceId: createVisionSourceId(videoPath),
      videoPath,
      fileName: frame.file_name,
      sourceFingerprint,
      frameId: frame.id,
      thumbnailPath: frame.thumbnail_path,
      timestampSeconds: frame.timestamp_seconds,
      intervalSeconds,
      scores: [...labelEmbeddings.entries()].flatMap(([labelId, embedding]) => {
        const label = labelsById.get(labelId)
        return label ? [{ label, similarity: dotProduct(frame.embedding, embedding) }] : []
      })
    })).map((evidence) => this.toEvidenceRow(evidence))
    await this.replaceEntityEvidenceRows(videoPath, rows)
    return rows.length
  }

  private async refreshObjectEvidence(
    videoPath: string,
    snapshot: VideoSourceSnapshot,
    intervalSeconds: number,
    framePointers: VisionFramePointer[],
    signal: AbortSignal
  ): Promise<number> {
    throwIfAborted(signal)
    const sourceFingerprint = createVisionSourceFingerprint(videoPath, snapshot.sizeBytes, snapshot.mtimeMs)
    const evidence: VisionEvidence[] = []
    for (const frame of framePointers) {
      throwIfAborted(signal)
      const result = await this.objectDetection.detectImage(frame.thumbnail_path)
      evidence.push(...createVisionObjectDetectionEvidence({
        sourceId: createVisionSourceId(videoPath),
        videoPath,
        fileName: frame.file_name,
        sourceFingerprint,
        frameId: frame.id,
        thumbnailPath: frame.thumbnail_path,
        timestampSeconds: frame.timestamp_seconds,
        intervalSeconds,
        detections: result.detections,
        modelId: result.modelId,
        modelVersion: result.modelVersion,
        threshold: result.threshold,
        generatedAt: result.generatedAt
      }))
    }
    await this.replaceObjectEvidenceRows(videoPath, evidence)
    return evidence.length
  }

  private createSourceRow(videoPath: string, snapshot: VideoSourceSnapshot, intervalSeconds: number, frameCount: number): VisionSourceRow {
    return {
      id: createHash('sha1').update(videoPath).digest('hex'),
      video_path: videoPath,
      file_name: basename(videoPath),
      file_size_bytes: snapshot.sizeBytes,
      file_mtime_ms: snapshot.mtimeMs,
      sample_interval_seconds: intervalSeconds,
      subtitle_path: snapshot.subtitle.path,
      subtitle_size_bytes: snapshot.subtitle.sizeBytes,
      subtitle_mtime_ms: snapshot.subtitle.mtimeMs,
      frame_count: frameCount,
      model_id: VISION_MODEL_ID,
      model_variant: VISION_MODEL_VARIANT,
      indexed_at_ms: Date.now()
    }
  }

  private async refreshCaptions(videoPath: string, snapshot: VideoSourceSnapshot, intervalSeconds: number, source: VisionSourceRow): Promise<void> {
    const framePointers = await this.getFramePointers(videoPath)
    const captionRows = this.buildCaptionRows(videoPath, snapshot.subtitle, framePointers)
    await this.replaceCaptionRows(videoPath, captionRows)
    await this.replaceSearchDocumentRows(videoPath, this.buildSearchDocumentRows(framePointers, captionRows))
    await this.replaceEvidenceRows(videoPath, this.buildEvidenceRows(videoPath, snapshot, intervalSeconds, framePointers, captionRows), createVisionSourceFingerprint(videoPath, snapshot.sizeBytes, snapshot.mtimeMs))
    await this.upsertSourceRow(this.createSourceRow(videoPath, snapshot, intervalSeconds, source.frame_count))
  }

  private async indexVideo(
    videoPath: string,
    snapshot: VideoSourceSnapshot,
    intervalSeconds: number,
    ffmpegPath: string,
    ffprobePath: string,
    signal: AbortSignal,
    onProgress: (processedFrames: number, totalFrames: number) => void
  ): Promise<number> {
    throwIfAborted(signal)
    const durationSeconds = await probeDuration(ffprobePath, videoPath)
    const timestamps = getSampleTimestamps(durationSeconds, intervalSeconds)
    const rows: VisionFrameRow[] = []

    for (const timestampSeconds of timestamps) {
      throwIfAborted(signal)
      const frame = await extractJpegFrame(ffmpegPath, videoPath, timestampSeconds)
      const frameId = createFrameId(videoPath, snapshot.mtimeMs, timestampSeconds)
      const thumbnailPath = join(this.thumbnailDirectory, `${frameId}.jpg`)
      await writeFile(thumbnailPath, frame)
      const embedding = await this.model.getImageEmbedding(thumbnailPath)
      rows.push({
        id: frameId,
        video_path: videoPath,
        file_name: basename(videoPath),
        timestamp_seconds: timestampSeconds,
        thumbnail_path: thumbnailPath,
        embedding,
        model_id: VISION_MODEL_ID,
        model_variant: VISION_MODEL_VARIANT,
        file_size_bytes: snapshot.sizeBytes,
        file_mtime_ms: snapshot.mtimeMs
      })
      onProgress(rows.length, timestamps.length)
    }

    await this.replaceVideoRows(videoPath, rows)
    const captionRows = this.buildCaptionRows(videoPath, snapshot.subtitle, rows)
    await this.replaceCaptionRows(videoPath, captionRows)
    await this.replaceSearchDocumentRows(videoPath, this.buildSearchDocumentRows(rows, captionRows))
    await this.replaceEvidenceRows(videoPath, this.buildEvidenceRows(videoPath, snapshot, intervalSeconds, rows, captionRows), createVisionSourceFingerprint(videoPath, snapshot.sizeBytes, snapshot.mtimeMs))
    await this.upsertSourceRow(this.createSourceRow(videoPath, snapshot, intervalSeconds, rows.length))
    return rows.length
  }

  async indexVideos(
    mediaPaths: string[],
    intervalSeconds: number = VISION_FRAME_INTERVAL_SECONDS,
    signal: AbortSignal = new AbortController().signal,
    onProgress: ProgressCallback = () => undefined,
    options: VisionIndexOptions = {}
  ): Promise<VisionIndexProgress> {
    const paths = Array.from(new Set(mediaPaths.filter((filePath) => isVideoFilePath(filePath))))
    const interval = Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : VISION_FRAME_INTERVAL_SECONDS

    let processedFrames = 0
    let totalFrames = 0
    let skippedVideos = 0
    let captionOnlyVideos = 0
    const fullPlans: Array<{ path: string; snapshot: VideoSourceSnapshot }> = []
    const plannedSnapshots = new Map<string, VideoSourceSnapshot>()
    let sceneEvidenceProcessed = 0
    let sceneEvidenceCount = 0
    let entityEvidenceProcessed = 0
    let entityEvidenceCount = 0
    let objectEvidenceProcessed = 0
    let objectEvidenceCount = 0
    const includeSceneEvidence = options.includeSceneEvidence === true && paths.length > 0
    const includeEntityEvidence = options.includeEntityEvidence === true && paths.length > 0
    const includeObjectEvidence = options.includeObjectEvidence === true && paths.length > 0
    const startedAtMs = Date.now()
    const timings: VisionIndexTimings = { planningMs: 0, modelLoadingMs: 0, framesMs: 0, sceneEvidenceMs: 0, entityEvidenceMs: 0, objectEvidenceMs: 0, vectorIndexMs: 0, textIndexMs: 0, totalMs: 0 }
    let activeStage: VisionIndexStage | null = null
    let activeVideoPath: string | undefined
    let currentVideoIndex = 0
    let activeStageStartedAtMs = startedAtMs
    const settleActiveStage = (nowMs: number): void => {
      if (activeStage) {
        const phase = VISION_TIMING_PHASE_BY_STAGE[activeStage]
        if (phase) timings[phase] += nowMs - activeStageStartedAtMs
      }
      activeStageStartedAtMs = nowMs
    }
    const getTimings = (): VisionIndexTimings => {
      const snapshot = { ...timings, totalMs: Date.now() - startedAtMs }
      if (activeStage) {
        const phase = VISION_TIMING_PHASE_BY_STAGE[activeStage]
        if (phase) snapshot[phase] += Date.now() - activeStageStartedAtMs
      }
      return snapshot
    }
    const emitProgress = (progress: Omit<VisionIndexProgress, 'phaseElapsedMs' | 'timings'>): VisionIndexProgress => {
      const nowMs = Date.now()
      if (activeStage !== progress.stage) {
        settleActiveStage(nowMs)
        activeStage = progress.stage
      }
      const terminal = progress.stage === 'completed' || progress.stage === 'cancelled' || progress.stage === 'error'
      const emitted = { ...progress, phaseElapsedMs: nowMs - activeStageStartedAtMs, ...(terminal ? { timings: getTimings() } : {}) }
      onProgress(emitted)
      return emitted
    }

    try {
      await ensureDirectory(this.thumbnailDirectory)
      emitProgress({ status: 'indexing', stage: 'planning', totalVideos: paths.length, currentVideoIndex: 0, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在检查影视库变化…' })
      for (const videoPath of paths) {
        throwIfAborted(signal)
        activeVideoPath = videoPath
        currentVideoIndex = skippedVideos + captionOnlyVideos
        const snapshot = await this.getVideoSourceSnapshot(videoPath, options.subtitlePaths?.get(videoPath))
        plannedSnapshots.set(videoPath, snapshot)
        const source = await this.getSourceRow(videoPath)
        if (source && this.isVideoSourceUnchanged(source, snapshot, interval)) {
          if (this.isSubtitleUnchanged(source, snapshot.subtitle)) {
            skippedVideos += 1
            emitProgress({ status: 'indexing', stage: 'planning', totalVideos: paths.length, currentVideoIndex: skippedVideos + captionOnlyVideos, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, currentVideoPath: videoPath, message: `已跳过未变化的视频：${basename(videoPath)}` })
          } else {
            await this.refreshCaptions(videoPath, snapshot, interval, source)
            captionOnlyVideos += 1
            emitProgress({ status: 'indexing', stage: 'planning', totalVideos: paths.length, currentVideoIndex: skippedVideos + captionOnlyVideos, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, currentVideoPath: videoPath, message: `已更新字幕索引：${basename(videoPath)}` })
          }
        } else {
          fullPlans.push({ path: videoPath, snapshot })
        }
      }

      activeVideoPath = undefined
      const needsMediaRuntime = fullPlans.length > 0 || (includeSceneEvidence && paths.length > 0)
      const ffmpegPath = needsMediaRuntime ? await resolveFfmpegPath(this.options.resourcePath, this.options.env, undefined) : null
      const ffprobePath = needsMediaRuntime ? await resolveFfprobePath(this.options.resourcePath, this.options.env, undefined) : null
      if (needsMediaRuntime && (!ffmpegPath || !ffprobePath)) throw new Error('未找到 ffmpeg 或 ffprobe，无法处理视觉索引')
      if ((fullPlans.length > 0 || includeEntityEvidence) && !this.model.isAvailable()) throw new Error(this.model.getStatusMessage())
      if (includeObjectEvidence) {
        const objectDetectionStatus = this.objectDetection.getStatus()
        if (!objectDetectionStatus.available) throw new Error(objectDetectionStatus.message)
      }

      if (fullPlans.length > 0 || includeObjectEvidence) {
        emitProgress({ status: 'loading', stage: 'loading-model', totalVideos: paths.length, currentVideoIndex: skippedVideos + captionOnlyVideos, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在加载视觉模型…' })
        if (fullPlans.length > 0) await this.model.prepareImageModel()
        if (includeObjectEvidence) await this.objectDetection.prepare()
      }
      for (let index = 0; index < fullPlans.length; index += 1) {
        throwIfAborted(signal)
        const plan = fullPlans[index]
        activeVideoPath = plan.path
        currentVideoIndex = skippedVideos + captionOnlyVideos + index + 1
        emitProgress({ status: 'indexing', stage: 'frames', totalVideos: paths.length, currentVideoIndex, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, currentVideoPath: plan.path, message: `正在处理 ${basename(plan.path)}` })
        const frameCount = await this.indexVideo(plan.path, plan.snapshot, interval, ffmpegPath as string, ffprobePath as string, signal, (videoProcessed, videoTotal) => {
          emitProgress({ status: 'indexing', stage: 'frames', totalVideos: paths.length, currentVideoIndex, totalFrames: totalFrames + videoTotal, processedFrames: processedFrames + videoProcessed, skippedVideos, captionOnlyVideos, currentVideoPath: plan.path, message: `正在处理 ${basename(plan.path)}` })
        })
        processedFrames += frameCount
        totalFrames += frameCount
      }
      if (includeSceneEvidence) {
        const scenePlans = paths
          .map((path) => ({ path, snapshot: plannedSnapshots.get(path) }))
          .filter((plan): plan is { path: string; snapshot: VideoSourceSnapshot } => plan.snapshot !== undefined)
        emitProgress({ status: 'indexing', stage: 'scene-evidence', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, sceneEvidenceTotal: scenePlans.length, sceneEvidenceProcessed, sceneEvidenceCount, message: '正在检测场景切换…' })
        for (const plan of scenePlans) {
          throwIfAborted(signal)
          activeVideoPath = plan.path
          const durationSeconds = await probeDuration(ffprobePath as string, plan.path)
          const framePointers = await this.getFramePointers(plan.path)
          sceneEvidenceCount += await this.refreshSceneEvidence(plan.path, plan.snapshot, durationSeconds, ffmpegPath as string, framePointers, signal)
          sceneEvidenceProcessed += 1
          emitProgress({ status: 'indexing', stage: 'scene-evidence', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, sceneEvidenceTotal: scenePlans.length, sceneEvidenceProcessed, sceneEvidenceCount, currentVideoPath: plan.path, message: `已完成场景检测：${basename(plan.path)}` })
        }
      }
      if (includeEntityEvidence) {
        const entityPlans = paths
          .map((path) => ({ path, snapshot: plannedSnapshots.get(path) }))
          .filter((plan): plan is { path: string; snapshot: VideoSourceSnapshot } => plan.snapshot !== undefined)
        emitProgress({ status: 'indexing', stage: 'entity-evidence', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, entityEvidenceTotal: entityPlans.length, entityEvidenceProcessed, entityEvidenceCount, message: '正在分析画面实体标签…' })
        const entityLabels = await this.getEntityLabels()
        const labelEmbeddings = await this.getEntityLabelEmbeddings(entityLabels)
        for (const plan of entityPlans) {
          throwIfAborted(signal)
          activeVideoPath = plan.path
          const frameRows = await this.getFrameRows(plan.path)
          entityEvidenceCount += await this.refreshEntityEvidence(plan.path, plan.snapshot, interval, frameRows, entityLabels, labelEmbeddings, signal)
          entityEvidenceProcessed += 1
          emitProgress({ status: 'indexing', stage: 'entity-evidence', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, entityEvidenceTotal: entityPlans.length, entityEvidenceProcessed, entityEvidenceCount, currentVideoPath: plan.path, message: `已完成实体标签：${basename(plan.path)}` })
        }
      }
      if (includeObjectEvidence) {
        const objectPlans = paths
          .map((path) => ({ path, snapshot: plannedSnapshots.get(path) }))
          .filter((plan): plan is { path: string; snapshot: VideoSourceSnapshot } => plan.snapshot !== undefined)
        emitProgress({ status: 'indexing', stage: 'object-evidence', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, objectEvidenceTotal: objectPlans.length, objectEvidenceProcessed, objectEvidenceCount, message: '正在检测画面物体…' })
        for (const plan of objectPlans) {
          throwIfAborted(signal)
          activeVideoPath = plan.path
          const framePointers = await this.getFramePointers(plan.path)
          objectEvidenceCount += await this.refreshObjectEvidence(plan.path, plan.snapshot, interval, framePointers, signal)
          objectEvidenceProcessed += 1
          emitProgress({ status: 'indexing', stage: 'object-evidence', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, objectEvidenceTotal: objectPlans.length, objectEvidenceProcessed, objectEvidenceCount, currentVideoPath: plan.path, message: `已完成物体检测：${basename(plan.path)}` })
        }
      }
      if (fullPlans.length > 0) {
        throwIfAborted(signal)
        activeVideoPath = undefined
        emitProgress({ status: 'indexing', stage: 'vector-index', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在维护向量 ANN 索引…' })
        await this.ensureVectorIndex(true)
        throwIfAborted(signal)
      }
      if (fullPlans.length > 0 || captionOnlyVideos > 0) {
        throwIfAborted(signal)
        activeVideoPath = undefined
        emitProgress({ status: 'indexing', stage: 'text-index', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在维护全文索引…' })
        await this.maintainSearchFullTextIndex()
        throwIfAborted(signal)
      }
      return emitProgress({ status: 'completed', stage: 'completed', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, ...(includeSceneEvidence ? { sceneEvidenceTotal: sceneEvidenceProcessed, sceneEvidenceProcessed, sceneEvidenceCount } : {}), ...(includeEntityEvidence ? { entityEvidenceTotal: entityEvidenceProcessed, entityEvidenceProcessed, entityEvidenceCount } : {}), ...(includeObjectEvidence ? { objectEvidenceTotal: objectEvidenceProcessed, objectEvidenceProcessed, objectEvidenceCount } : {}), message: `索引完成，共处理 ${processedFrames} 个视频帧，跳过 ${skippedVideos} 个未变化视频，更新 ${captionOnlyVideos} 个字幕索引${includeSceneEvidence ? `，生成 ${sceneEvidenceCount} 个场景证据` : ''}${includeEntityEvidence ? `，生成 ${entityEvidenceCount} 个实体证据` : ''}${includeObjectEvidence ? `，生成 ${objectEvidenceCount} 个物体证据` : ''}` })
    } catch (error) {
      if (isAbortError(error)) {
        return emitProgress({ status: 'cancelled', stage: 'cancelled', totalVideos: paths.length, currentVideoIndex, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '索引已取消' })
      }
      const message = error instanceof Error ? error.message : String(error)
      const failedStage = activeStage && activeStage !== 'error' ? activeStage : undefined
      emitProgress({ status: 'error', stage: 'error', totalVideos: paths.length, currentVideoIndex, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, currentVideoPath: activeVideoPath, failedStage, error: message, message })
      throw error
    }
  }

  private async search(embedding: number[], limit: number, excludeRequest?: VisionSimilarSearchRequest): Promise<VisionSearchResult[]> {
    await this.ensureVectorIndex(false)
    const table = await this.getTable()
    if (!table) return []
    const resultLimit = clampLimit(limit)
    const vectorQuery = table.search(embedding) as VectorQuery
    const rows = await vectorQuery
      .distanceType(VISION_VECTOR_DISTANCE_TYPE)
      .limit(Math.min(100, resultLimit + (excludeRequest ? 1 : 0)))
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'model_id', 'model_variant', '_distance'])
      .toArray() as unknown as Array<Record<string, unknown>>
    const evidenceByFrame = await this.getVisualEvidenceByFrameIds(rows.map((item) => String(item.id)))
    const results: VisionSearchResult[] = rows.map((item) => {
      const frameId = String(item.id)
      const evidence = evidenceByFrame.get(frameId)
      const distance = Number(item._distance)
      const score = Number.isFinite(distance) ? Math.max(0, Math.min(1, 1 - distance)) : 0
      return {
        id: frameId,
        videoPath: String(item.video_path),
        fileName: String(item.file_name),
        timestampSeconds: Number(item.timestamp_seconds),
        thumbnailPath: String(item.thumbnail_path),
        score,
        visualScore: score,
        matchSource: 'visual',
        evidenceId: evidence?.id,
        frameId,
        sourceId: evidence?.source_id,
        startSeconds: evidence?.start_seconds,
        endSeconds: evidence?.end_seconds,
        evidenceType: evidence?.evidence_type ?? 'visual',
        confidence: evidence?.confidence ?? undefined,
        box: evidence ? boxFromEvidenceRow(evidence) : undefined,
        sourceFingerprint: evidence?.source_fingerprint,
        modelId: String(item.model_id),
        modelVariant: String(item.model_variant)
      }
    })
    return results.filter((result) => !excludeRequest || !isVisionSimilarSearchTarget(result, excludeRequest)).slice(0, resultLimit)
  }

  private async searchAll(embedding: number[], excludeRequest?: VisionSimilarSearchRequest, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
    if (!revision) await this.ensureVectorIndex(false)
    const table = await this.getTable(revision)
    if (!table) return []
    const rows = await table.query()
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'embedding', 'model_id', 'model_variant'])
      .limit(VISION_SEARCH_FULL_EXPORT_MAX_RESULTS)
      .toArray() as unknown as Array<Record<string, unknown>>
    throwIfVisionSearchAborted(signal)
    const scoredRows = rows
      .map((item, index) => {
        if (index % 256 === 0) throwIfVisionSearchAborted(signal)
        return { item, score: dotProduct(embedding, item.embedding) }
      })
      .filter(({ score }) => Number.isFinite(score))
      .sort((left, right) => right.score - left.score || String(left.item.id).localeCompare(String(right.item.id)))
    const evidenceByFrame = await this.getVisualEvidenceByFrameIds(scoredRows.map(({ item }) => String(item.id)), signal, revision)
    const results = scoredRows.map(({ item, score }, index) => {
      if (index % 256 === 0) throwIfVisionSearchAborted(signal)
      const frameId = String(item.id)
      const evidence = evidenceByFrame.get(frameId)
      const normalizedScore = Math.max(0, Math.min(1, score))
      return {
        id: frameId,
        videoPath: String(item.video_path),
        fileName: String(item.file_name),
        timestampSeconds: Number(item.timestamp_seconds),
        thumbnailPath: String(item.thumbnail_path),
        score: normalizedScore,
        visualScore: normalizedScore,
        matchSource: 'visual' as const,
        evidenceId: evidence?.id,
        frameId,
        sourceId: evidence?.source_id,
        startSeconds: evidence?.start_seconds,
        endSeconds: evidence?.end_seconds,
        evidenceType: evidence?.evidence_type ?? 'visual',
        confidence: evidence?.confidence ?? undefined,
        box: evidence ? boxFromEvidenceRow(evidence) : undefined,
        sourceFingerprint: evidence?.source_fingerprint,
        modelId: String(item.model_id),
        modelVariant: String(item.model_variant)
      }
    })
    return results.filter((result) => !excludeRequest || !isVisionSimilarSearchTarget(result, excludeRequest))
  }

  private async getVisualEvidenceByFrameIds(frameIds: readonly string[], signal?: AbortSignal, revision?: VisionSearchRevision): Promise<Map<string, VisionEvidenceRow>> {
    const result = new Map<string, VisionEvidenceRow>()
    if (frameIds.length === 0) return result
    try {
      const table = await this.getEvidenceTable(revision)
      if (!table) return result
      const wanted = new Set(frameIds)
      const rows = await table.query()
        .select(['id', 'source_id', 'video_path', 'file_name', 'evidence_type', 'start_seconds', 'end_seconds', 'text', 'frame_id', 'thumbnail_path', 'confidence', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax', 'source_fingerprint', 'model_id', 'model_variant', 'generated_at'])
        .limit(METADATA_SCAN_LIMIT)
        .toArray() as unknown as VisionEvidenceRow[]
      for (const [index, row] of rows.entries()) {
        if (index % 256 === 0) throwIfVisionSearchAborted(signal)
        if (row.evidence_type === 'visual' && wanted.has(row.frame_id)) result.set(row.frame_id, row)
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      // Evidence is an additive layer. A malformed or old table must not break visual search.
    }
    return result
  }

  private async searchVisualCandidates(embedding: number[], limit: number): Promise<VisualSearchCandidate[]> {
    const results = await this.search(embedding, Math.min(100, Math.max(clampLimit(limit) * 4, 50)))
    const denominator = Math.max(1, results.length)
    return results.map((result, index) => ({
      result,
      visualRankScore: 1 - index / denominator
    }))
  }

  private async searchLexicalByScan(query: string, limit: number, full = false, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<LexicalSearchCandidate[]> {
    const candidates = new Map<string, LexicalSearchCandidate>()
    const captionTable = await this.getCaptionTable(revision)
    if (captionTable) {
      const rows = await captionTable.query()
        .select(['id', 'video_path', 'file_name', 'frame_id', 'timestamp_seconds', 'thumbnail_path', 'start_seconds', 'end_seconds', 'text'])
        .limit(METADATA_SCAN_LIMIT)
        .toArray() as unknown as Array<Record<string, unknown>>
      for (const [index, row] of rows.entries()) {
        if (index % 256 === 0) throwIfVisionSearchAborted(signal)
        const match = calculateVisionLexicalMatch(query, String(row.text ?? ''), String(row.file_name ?? ''))
        if (!match) continue
        const id = String(row.frame_id)
        const result: VisionSearchResult = {
          id,
          videoPath: String(row.video_path),
          fileName: String(row.file_name),
          timestampSeconds: Number(row.timestamp_seconds),
          thumbnailPath: String(row.thumbnail_path),
          score: match.score,
          lexicalScore: match.score,
          matchedText: match.matchedText,
          matchSource: match.source,
          evidenceId: String(row.id),
          frameId: id,
          startSeconds: Number(row.start_seconds),
          endSeconds: Number(row.end_seconds),
          evidenceType: 'subtitle',
          modelId: VISION_MODEL_ID,
          modelVariant: VISION_MODEL_VARIANT
        }
        candidates.set(id, { result, lexicalScore: match.score, matchSource: match.source })
      }
    }

    const frameTable = await this.getTable(revision)
    if (frameTable) {
      const rows = await frameTable.query()
        .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'model_id', 'model_variant'])
        .limit(METADATA_SCAN_LIMIT)
        .toArray() as unknown as Array<Record<string, unknown>>
      for (const [index, row] of rows.entries()) {
        if (index % 256 === 0) throwIfVisionSearchAborted(signal)
        const id = String(row.id)
        const match = calculateVisionLexicalMatch(query, '', String(row.file_name ?? ''))
        if (!match) continue
        const existing = candidates.get(id)
        if (existing) continue
        const result: VisionSearchResult = {
          id,
          videoPath: String(row.video_path),
          fileName: String(row.file_name),
          timestampSeconds: Number(row.timestamp_seconds),
          thumbnailPath: String(row.thumbnail_path),
          score: match.score,
          lexicalScore: match.score,
          matchedText: match.matchedText,
          matchSource: 'filename',
          modelId: String(row.model_id),
          modelVariant: String(row.model_variant)
        }
        candidates.set(id, { result, lexicalScore: match.score, matchSource: 'filename' })
      }
    }

    return [...candidates.values()]
      .sort((left, right) => right.lexicalScore - left.lexicalScore || left.result.id.localeCompare(right.result.id))
      .slice(0, fullSearchCandidateLimit(full, limit))
  }

  private async searchLexicalByEvidence(query: string, limit: number, full = false, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<LexicalSearchCandidate[] | null> {
    const table = await this.getEvidenceTable(revision)
    if (!table) return null
    const candidates = new Map<string, LexicalSearchCandidate>()
    const rows = await table.query()
      .select(['id', 'source_id', 'video_path', 'file_name', 'evidence_type', 'start_seconds', 'end_seconds', 'text', 'frame_id', 'thumbnail_path', 'confidence', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax', 'source_fingerprint', 'model_id', 'model_variant'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray() as unknown as Array<Record<string, unknown>>
    for (const [index, row] of rows.entries()) {
      if (index % 256 === 0) throwIfVisionSearchAborted(signal)
      const evidenceId = String(row.id)
      const frameId = String(row.frame_id ?? '').trim() || undefined
      const evidenceType = String(row.evidence_type) as VisionEvidenceType
      const match = calculateVisionLexicalMatch(query, String(row.text ?? ''), String(row.file_name ?? ''))
      if (!match) continue
      const result: VisionSearchResult = {
        id: evidenceType === 'subtitle' || evidenceType === 'visual' ? frameId ?? evidenceId : evidenceId,
        videoPath: String(row.video_path),
        fileName: String(row.file_name),
        timestampSeconds: Number(row.start_seconds),
        thumbnailPath: String(row.thumbnail_path ?? ''),
        score: match.score,
        lexicalScore: match.score,
        matchedText: match.matchedText,
        matchSource: match.source,
        evidenceId,
        frameId,
        sourceId: String(row.source_id),
        startSeconds: Number(row.start_seconds),
        endSeconds: Number(row.end_seconds),
        evidenceType,
        confidence: Number.isFinite(Number(row.confidence)) && Number(row.confidence) >= 0 ? Number(row.confidence) : undefined,
        box: boxFromEvidenceRow(row),
        entityLabelId: evidenceType === 'entity' ? getVisionEntityLabelIdForDisplayName(String(row.text ?? '')) : undefined,
        sourceFingerprint: String(row.source_fingerprint ?? ''),
        modelId: String(row.model_id ?? VISION_MODEL_ID),
        modelVariant: String(row.model_variant ?? VISION_MODEL_VARIANT)
      }
      const resultKey = getVisionSearchResultKey(result)
      const existing = candidates.get(resultKey)
      if (!existing || match.score > existing.lexicalScore) candidates.set(resultKey, { result, lexicalScore: match.score, matchSource: match.source })
    }
    return [...candidates.values()]
      .sort((left, right) => right.lexicalScore - left.lexicalScore || left.result.id.localeCompare(right.result.id))
      .slice(0, fullSearchCandidateLimit(full, limit))
  }

  private async searchLexical(query: string, limit: number, full = false, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<LexicalSearchCandidate[]> {
    try {
      const evidenceCandidates = await this.searchLexicalByEvidence(query, limit, full, signal, revision)
      if (evidenceCandidates) return evidenceCandidates
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      if (isVisionSearchRevisionUnavailableError(error)) throw error
      // Fall through to the legacy caption/FTS path for old or partially written indexes.
    }
    try {
      const table = await this.ensureSearchDocuments(revision)
      if (!table) return []
      const rows = await table.query()
        .fullTextSearch(query, { columns: SEARCH_TEXT_COLUMN })
        .select(['id', 'video_path', 'file_name', 'frame_id', 'timestamp_seconds', 'thumbnail_path', 'caption_text', '_score'])
        .limit(fullSearchCandidateLimit(full, limit))
        .toArray() as unknown as Array<Record<string, unknown>>
      const candidates: LexicalSearchCandidate[] = []
      for (const [index, row] of rows.entries()) {
        if (index % 256 === 0) throwIfVisionSearchAborted(signal)
        const match = calculateVisionLexicalMatch(query, String(row.caption_text ?? ''), String(row.file_name ?? ''))
        if (!match) continue
        const frameId = String(row.frame_id ?? row.id)
        const result: VisionSearchResult = {
          id: frameId,
          videoPath: String(row.video_path),
          fileName: String(row.file_name),
          timestampSeconds: Number(row.timestamp_seconds),
          thumbnailPath: String(row.thumbnail_path),
          score: match.score,
          lexicalScore: match.score,
          matchedText: match.matchedText,
          matchSource: match.source,
          frameId,
          modelId: VISION_MODEL_ID,
          modelVariant: VISION_MODEL_VARIANT
        }
        candidates.push({ result, lexicalScore: match.score, matchSource: match.source })
      }
      return candidates
        .sort((left, right) => right.lexicalScore - left.lexicalScore || left.result.id.localeCompare(right.result.id))
        .slice(0, fullSearchCandidateLimit(full, limit))
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      return this.searchLexicalByScan(query, limit, full, signal, revision)
    }
  }

  private async listObjectEvidenceByFilter(filter: VisionObjectDetectionFilterState, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionEvidenceRow[]> {
    const table = await this.getEvidenceTable(revision)
    if (!table) return []
    const labelQuery = filter.labelQuery.trim().toLocaleLowerCase()
    const categoryLabels = new Set(filter.categoryLabels.map((label) => label.trim().toLocaleLowerCase()).filter(Boolean))
    const rows = await table.query()
      .select(['id', 'source_id', 'video_path', 'file_name', 'evidence_type', 'start_seconds', 'end_seconds', 'text', 'frame_id', 'thumbnail_path', 'confidence', 'box_xmin', 'box_ymin', 'box_xmax', 'box_ymax', 'source_fingerprint', 'model_id', 'model_variant', 'generated_at'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray() as unknown as VisionEvidenceRow[]
    const filteredRows: VisionEvidenceRow[] = []
    for (const [index, row] of rows.entries()) {
      if (index % 256 === 0) throwIfVisionSearchAborted(signal)
      if (row.evidence_type !== 'object') continue
      const label = row.text.trim().toLocaleLowerCase()
      const confidence = typeof row.confidence === 'number' && Number.isFinite(row.confidence) ? row.confidence : 0
      if ((!labelQuery || label.includes(labelQuery))
        && (categoryLabels.size === 0 || categoryLabels.has(label))
        && confidence >= filter.minimumScore) filteredRows.push(row)
    }
    return filteredRows.sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0) || right.generated_at - left.generated_at)
  }

  private createObjectEvidenceSearchResult(row: VisionEvidenceRow, match: ReturnType<typeof calculateVisionLexicalMatch>): VisionSearchResult | null {
    if (!match) return null
    const evidenceId = row.id
    const frameId = row.frame_id.trim() || undefined
    return {
      id: evidenceId,
      videoPath: row.video_path,
      fileName: row.file_name,
      timestampSeconds: row.start_seconds,
      thumbnailPath: row.thumbnail_path,
      score: match.score,
      lexicalScore: match.score,
      matchedText: match.matchedText,
      matchSource: match.source,
      evidenceId,
      frameId,
      sourceId: row.source_id,
      startSeconds: row.start_seconds,
      endSeconds: row.end_seconds,
      evidenceType: 'object',
      confidence: row.confidence ?? undefined,
      box: boxFromEvidenceRow(row),
      sourceFingerprint: row.source_fingerprint,
      modelId: row.model_id || VISION_MODEL_ID,
      modelVariant: row.model_variant || VISION_MODEL_VARIANT
    }
  }

  private searchObjectEvidenceRows(query: string, rows: readonly VisionEvidenceRow[], limit: number, full = false): VisionSearchResult[] {
    return rows
      .map((row) => this.createObjectEvidenceSearchResult(row, calculateVisionLexicalMatch(query, row.text, row.file_name)))
      .filter((result): result is VisionSearchResult => result !== null)
      .sort((left, right) => right.score - left.score || (right.confidence ?? 0) - (left.confidence ?? 0) || left.id.localeCompare(right.id))
      .slice(0, full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : clampLimit(limit))
  }

  /** Searches all persisted object evidence rows with label, category and score constraints. */
  async searchObjectEvidence(query: string, filter: VisionObjectDetectionFilterState, limit?: number): Promise<VisionSearchResult[]> {
    const normalizedFilter = normalizeVisionObjectDetectionFilterState(filter)
    if (!normalizedFilter) return []
    const rows = await this.listObjectEvidenceByFilter(normalizedFilter)
    return this.searchObjectEvidenceRows(query.trim(), rows, limit === undefined ? 24 : limit)
  }

  private filterResultsByObjectEvidence(results: readonly VisionSearchResult[], rows: readonly VisionEvidenceRow[]): VisionSearchResult[] {
    const matchingEvidenceIds = new Set(rows.map((row) => row.id))
    const matchingFrameIds = new Set(rows.map((row) => row.frame_id.trim()).filter(Boolean))
    return results.filter((result) => {
      if (result.evidenceType === 'object' && result.evidenceId && matchingEvidenceIds.has(result.evidenceId)) return true
      return Boolean(result.frameId && matchingFrameIds.has(result.frameId))
    })
  }

  private mergeObjectScopedResults(results: readonly VisionSearchResult[], directResults: readonly VisionSearchResult[], limit: number, full = false): VisionSearchResult[] {
    const merged = new Map<string, VisionSearchResult>()
    for (const result of [...results, ...directResults]) {
      const key = `${result.videoPath}\0${getVisionSearchResultKey(result)}`
      const previous = merged.get(key)
      if (!previous || result.score > previous.score) merged.set(key, result)
    }
    return [...merged.values()].sort((left, right) => right.score - left.score || left.id.localeCompare(right.id)).slice(0, full ? VISION_SEARCH_FULL_EXPORT_MAX_RESULTS : clampLimit(limit))
  }

  private async searchHybrid(embedding: number[], query: string, limit: number): Promise<VisionSearchResult[]> {
    const visualCandidates = await this.searchVisualCandidates(embedding, limit)
    const lexicalCandidates = await this.searchLexical(query, limit)
    const merged = new Map<string, { result: VisionSearchResult; visualRankScore: number; lexicalScore: number; matchSource: VisionMatchSource }>()

    const mergeKey = (result: VisionSearchResult): string => `${result.videoPath}\0${getVisionSearchResultKey(result)}`

    for (const candidate of visualCandidates) {
      merged.set(mergeKey(candidate.result), {
        result: candidate.result,
        visualRankScore: candidate.visualRankScore,
        lexicalScore: 0,
        matchSource: 'visual'
      })
    }

    for (const candidate of lexicalCandidates) {
      const existing = merged.get(mergeKey(candidate.result))
      if (existing) {
        existing.lexicalScore = candidate.lexicalScore
        existing.matchSource = 'both'
        existing.result.matchedText = candidate.result.matchedText
        existing.result.evidenceId = candidate.result.evidenceId ?? existing.result.evidenceId
        if (candidate.result.evidenceType === 'subtitle') existing.result.timestampSeconds = candidate.result.timestampSeconds
        existing.result.startSeconds = candidate.result.startSeconds ?? existing.result.startSeconds
        existing.result.endSeconds = candidate.result.endSeconds ?? existing.result.endSeconds
        existing.result.evidenceType = candidate.result.evidenceType ?? existing.result.evidenceType
        existing.result.entityLabelId = candidate.result.entityLabelId ?? existing.result.entityLabelId
        existing.result.sourceId = candidate.result.sourceId ?? existing.result.sourceId
        existing.result.sourceFingerprint = candidate.result.sourceFingerprint ?? existing.result.sourceFingerprint
      } else {
        merged.set(mergeKey(candidate.result), {
          result: candidate.result,
          visualRankScore: 0,
          lexicalScore: candidate.lexicalScore,
          matchSource: candidate.matchSource
        })
      }
    }

    return [...merged.values()]
      .map((candidate) => ({
        ...candidate.result,
        score: combineVisionHybridScore(candidate.visualRankScore, candidate.lexicalScore),
        visualScore: candidate.result.visualScore,
        lexicalScore: candidate.lexicalScore,
        matchSource: candidate.matchSource
      }))
      .sort((left, right) => right.score - left.score)
      .slice(0, clampLimit(limit))
  }

  private async searchHybridAll(embedding: number[], query: string, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
    const visualResults = await this.searchAll(embedding, undefined, signal, revision)
    const visualCandidates = visualResults.map((result, index) => ({ result, visualRankScore: 1 - index / Math.max(1, visualResults.length) }))
    const lexicalCandidates = await this.searchLexical(query, VISION_SEARCH_FULL_EXPORT_MAX_RESULTS, true, signal, revision)
    const merged = new Map<string, { result: VisionSearchResult; visualRankScore: number; lexicalScore: number; matchSource: VisionMatchSource }>()
    const mergeKey = (result: VisionSearchResult): string => `${result.videoPath}\0${getVisionSearchResultKey(result)}`

    for (const candidate of visualCandidates) {
      merged.set(mergeKey(candidate.result), {
        result: candidate.result,
        visualRankScore: candidate.visualRankScore,
        lexicalScore: 0,
        matchSource: 'visual'
      })
    }

    for (const candidate of lexicalCandidates) {
      const existing = merged.get(mergeKey(candidate.result))
      if (existing) {
        existing.lexicalScore = candidate.lexicalScore
        existing.matchSource = 'both'
        existing.result.matchedText = candidate.result.matchedText
        existing.result.evidenceId = candidate.result.evidenceId ?? existing.result.evidenceId
        if (candidate.result.evidenceType === 'subtitle') existing.result.timestampSeconds = candidate.result.timestampSeconds
        existing.result.startSeconds = candidate.result.startSeconds ?? existing.result.startSeconds
        existing.result.endSeconds = candidate.result.endSeconds ?? existing.result.endSeconds
        existing.result.evidenceType = candidate.result.evidenceType ?? existing.result.evidenceType
        existing.result.entityLabelId = candidate.result.entityLabelId ?? existing.result.entityLabelId
        existing.result.sourceId = candidate.result.sourceId ?? existing.result.sourceId
        existing.result.sourceFingerprint = candidate.result.sourceFingerprint ?? existing.result.sourceFingerprint
      } else {
        merged.set(mergeKey(candidate.result), {
          result: candidate.result,
          visualRankScore: 0,
          lexicalScore: candidate.lexicalScore,
          matchSource: candidate.matchSource
        })
      }
    }

    return [...merged.values()]
      .map((candidate) => ({
        ...candidate.result,
        score: combineVisionHybridScore(candidate.visualRankScore, candidate.lexicalScore),
        visualScore: candidate.result.visualScore,
        lexicalScore: candidate.lexicalScore,
        matchSource: candidate.matchSource
      }))
      .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
  }

  private async searchTextBase(query: string, limit?: number, mode: VisionSearchMode = 'hybrid'): Promise<VisionSearchResult[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []
    const targetLimit = clampLimit(limit)
    if (mode === 'visual') return this.search(await this.model.getTextEmbedding(normalizedQuery), targetLimit)
    try {
      const embedding = await this.model.getTextEmbedding(normalizedQuery)
      return await this.searchHybrid(embedding, normalizedQuery, targetLimit)
    } catch (error) {
      const lexicalCandidates = await this.searchLexical(normalizedQuery, targetLimit)
      if (lexicalCandidates.length === 0) throw error
      return lexicalCandidates.slice(0, targetLimit).map((candidate) => ({
        ...candidate.result,
        score: candidate.lexicalScore,
        visualScore: 0,
        lexicalScore: candidate.lexicalScore,
        matchSource: candidate.matchSource
      }))
    }
  }

  private async searchTextBaseAll(query: string, mode: VisionSearchMode = 'hybrid', signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []
    if (mode === 'visual') return this.searchAll(await this.model.getTextEmbedding(normalizedQuery), undefined, signal, revision)
    try {
      const embedding = await this.model.getTextEmbedding(normalizedQuery)
      return await this.searchHybridAll(embedding, normalizedQuery, signal, revision)
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') throw error
      if (isVisionSearchRevisionUnavailableError(error)) throw error
      const lexicalCandidates = await this.searchLexical(normalizedQuery, VISION_SEARCH_FULL_EXPORT_MAX_RESULTS, true, signal, revision)
      if (lexicalCandidates.length === 0) throw error
      return lexicalCandidates.map((candidate) => ({
        ...candidate.result,
        score: candidate.lexicalScore,
        visualScore: 0,
        lexicalScore: candidate.lexicalScore,
        matchSource: candidate.matchSource
      }))
    }
  }

  async searchText(query: string, limit?: number, mode: VisionSearchMode = 'hybrid', objectDetectionFilter?: VisionObjectDetectionFilterState): Promise<VisionSearchResult[]> {
    const normalizedFilter = normalizeVisionObjectDetectionFilterState(objectDetectionFilter)
    if (!normalizedFilter || !isVisionObjectDetectionFilterActive(normalizedFilter)) return this.searchTextBase(query, limit, mode)
    const targetLimit = clampLimit(limit)
    const rows = await this.listObjectEvidenceByFilter(normalizedFilter)
    if (rows.length === 0) return []
    const expandedResults = await this.searchTextBase(query, Math.min(100, Math.max(targetLimit * 4, 50)), mode)
    const scopedResults = this.filterResultsByObjectEvidence(expandedResults, rows)
    const directResults = this.searchObjectEvidenceRows(query.trim(), rows, Math.min(100, Math.max(targetLimit * 4, 50)))
    return this.mergeObjectScopedResults(scopedResults, directResults, targetLimit)
  }

  async searchTextAll(query: string, mode: VisionSearchMode = 'hybrid', objectDetectionFilter?: VisionObjectDetectionFilterState, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
    const normalizedFilter = normalizeVisionObjectDetectionFilterState(objectDetectionFilter)
    if (!normalizedFilter || !isVisionObjectDetectionFilterActive(normalizedFilter)) return this.searchTextBaseAll(query, mode, signal, revision)
    const rows = await this.listObjectEvidenceByFilter(normalizedFilter, signal, revision)
    if (rows.length === 0) return []
    const expandedResults = await this.searchTextBaseAll(query, mode, signal, revision)
    const scopedResults = this.filterResultsByObjectEvidence(expandedResults, rows)
    const directResults = this.searchObjectEvidenceRows(query.trim(), rows, VISION_SEARCH_FULL_EXPORT_MAX_RESULTS, true)
    return this.mergeObjectScopedResults(scopedResults, directResults, VISION_SEARCH_FULL_EXPORT_MAX_RESULTS, true)
  }

  async searchImage(imagePath: string, limit?: number, objectDetectionFilter?: VisionObjectDetectionFilterState): Promise<VisionSearchResult[]> {
    const image = await stat(imagePath)
    if (!image.isFile()) throw new Error('以图搜图输入不是有效文件')
    const normalizedFilter = normalizeVisionObjectDetectionFilterState(objectDetectionFilter)
    const targetLimit = clampLimit(limit)
    if (!normalizedFilter || !isVisionObjectDetectionFilterActive(normalizedFilter)) return this.search(await this.model.getImageEmbedding(imagePath), targetLimit)
    const rows = await this.listObjectEvidenceByFilter(normalizedFilter)
    if (rows.length === 0) return []
    const expandedResults = await this.search(await this.model.getImageEmbedding(imagePath), Math.min(100, Math.max(targetLimit * 4, 50)))
    return this.filterResultsByObjectEvidence(expandedResults, rows).slice(0, targetLimit)
  }

  async searchImageAll(imagePath: string, objectDetectionFilter?: VisionObjectDetectionFilterState, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
    const image = await stat(imagePath)
    if (!image.isFile()) throw new Error('以图搜图输入不是有效文件')
    const normalizedFilter = normalizeVisionObjectDetectionFilterState(objectDetectionFilter)
    const results = await this.searchAll(await this.model.getImageEmbedding(imagePath), undefined, signal, revision)
    if (!normalizedFilter || !isVisionObjectDetectionFilterActive(normalizedFilter)) return results
    const rows = await this.listObjectEvidenceByFilter(normalizedFilter, signal, revision)
    return this.filterResultsByObjectEvidence(results, rows)
  }

  async searchSimilar(request: VisionSimilarSearchRequest): Promise<VisionSearchResult[]> {
    const normalizedRequest = normalizeVisionSimilarSearchRequest(request)
    if (!normalizedRequest?.thumbnailPath) return []
    await this.readThumbnail(normalizedRequest.thumbnailPath)
    const embedding = await this.model.getImageEmbedding(normalizedRequest.thumbnailPath)
    return this.search(embedding, normalizedRequest.limit ?? 24, normalizedRequest)
  }

  async searchSimilarAll(request: VisionSimilarSearchRequest, signal?: AbortSignal, revision?: VisionSearchRevision): Promise<VisionSearchResult[]> {
    const normalizedRequest = normalizeVisionSimilarSearchRequest(request)
    if (!normalizedRequest?.thumbnailPath) return []
    await this.readThumbnail(normalizedRequest.thumbnailPath)
    return this.searchAll(await this.model.getImageEmbedding(normalizedRequest.thumbnailPath), normalizedRequest, signal, revision)
  }

  async readThumbnail(thumbnailPath: string): Promise<string> {
    const normalizedPath = resolve(thumbnailPath)
    const thumbnailRoot = resolve(this.thumbnailDirectory)
    if (relative(thumbnailRoot, normalizedPath).startsWith(`..${sep}`) || relative(thumbnailRoot, normalizedPath) === '..') {
      throw new Error('缩略图路径不在视觉索引目录中')
    }
    const buffer = await readFile(normalizedPath)
    return `data:image/jpeg;base64,${buffer.toString('base64')}`
  }
}
