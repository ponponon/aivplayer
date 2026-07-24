import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { connect, Index, type Table, type VectorQuery } from '@lancedb/lancedb'
import { isVideoFilePath } from '../media/file-opening'
import { parseVtt } from './subtitle-writer.ts'
import { resolveFfmpegPath, resolveFfprobePath } from './whisper-cpp-runtime'
import { VisionEmbeddingRuntime } from './vision-model'
import { calculateVisionLexicalMatch, combineVisionHybridScore } from './vision-search'
import {
  VISION_FRAME_INTERVAL_SECONDS,
  VISION_MODEL_ID,
  VISION_MODEL_VARIANT,
  VISION_VECTOR_DISTANCE_TYPE,
  VISION_VECTOR_INDEX_MIN_ROWS,
  VISION_VECTOR_INDEX_TYPE,
  type VisionIndexProgress,
  type VisionIndexStage,
  type VisionIndexTimings,
  type VisionMatchSource,
  type VisionRuntimeStatus,
  type VisionSearchMode,
  type VisionSearchResult
} from '../../shared/vision-types'

const execFileAsync = promisify(execFile)
const TABLE_NAME = 'video_frames'
const SOURCE_TABLE_NAME = 'video_sources'
const CAPTION_TABLE_NAME = 'video_captions'
const SEARCH_DOCUMENT_TABLE_NAME = 'video_search_documents'
const SEARCH_TEXT_COLUMN = 'search_text'
const VECTOR_COLUMN = 'embedding'
const VECTOR_INDEX_NAME = `${VECTOR_COLUMN}_idx`
const VECTOR_INDEX_MAX_PARTITIONS = 256
const VECTOR_INDEX_OPTIMIZE_MIN_UNINDEXED_ROWS = 256
const VECTOR_INDEX_OPTIMIZE_RATIO = 0.05
const METADATA_SCAN_LIMIT = 1_000_000

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
}

type ProgressCallback = (progress: VisionIndexProgress) => void

export type VisionIndexOptions = {
  subtitlePaths?: ReadonlyMap<string, string>
}

type VisionTimingPhase = Exclude<keyof VisionIndexTimings, 'totalMs'>

const VISION_TIMING_PHASE_BY_STAGE: Partial<Record<VisionIndexStage, VisionTimingPhase>> = {
  planning: 'planningMs',
  'loading-model': 'modelLoadingMs',
  frames: 'framesMs',
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError'
}

function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    const error = new Error('视觉索引已取消')
    error.name = 'AbortError'
    throw error
  }
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
  private readonly indexDirectory: string
  private readonly thumbnailDirectory: string
  private readonly databaseDirectory: string
  private dbPromise: ReturnType<typeof connect> | null = null
  private searchDocumentMaintenancePromise: Promise<void> | null = null
  private vectorIndexMaintenancePromise: Promise<void> | null = null
  private searchDocumentsReady = false

  private readonly options: VisionLibraryOptions

  constructor(options: VisionLibraryOptions) {
    this.options = options
    this.model = new VisionEmbeddingRuntime(options.resourcePath)
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

  private async getTableByName(name: string): Promise<Table | null> {
    const db = await this.getDatabase()
    const tableNames = await db.tableNames()
    if (!tableNames.includes(name)) return null
    return db.openTable(name)
  }

  private async getTable(): Promise<Table | null> {
    return this.getTableByName(TABLE_NAME)
  }

  private async getSourceTable(): Promise<Table | null> {
    return this.getTableByName(SOURCE_TABLE_NAME)
  }

  private async getCaptionTable(): Promise<Table | null> {
    return this.getTableByName(CAPTION_TABLE_NAME)
  }

  private async getSearchDocumentTable(): Promise<Table | null> {
    return this.getTableByName(SEARCH_DOCUMENT_TABLE_NAME)
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

  private async getAllFramePointers(): Promise<VisionFramePointer[]> {
    const table = await this.getTable()
    if (!table) return []
    const rows = await table.query()
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path'])
      .limit(METADATA_SCAN_LIMIT)
      .toArray()
    return rows as unknown as VisionFramePointer[]
  }

  private async getAllCaptionRows(): Promise<VisionCaptionRow[]> {
    const table = await this.getCaptionTable()
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

  private async ensureSearchDocuments(): Promise<Table | null> {
    if (this.searchDocumentsReady) return this.getSearchDocumentTable()
    let table = await this.getSearchDocumentTable()
    const framePointers = await this.getAllFramePointers()
    if (framePointers.length === 0) return null
    if (!table) {
      table = await this.rebuildSearchDocuments()
    } else {
      const rows = await table.query().select(['id']).limit(METADATA_SCAN_LIMIT).toArray()
      if (rows.length < framePointers.length) table = await this.rebuildSearchDocuments()
    }
    await this.maintainSearchFullTextIndex()
    this.searchDocumentsReady = table !== null
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
    const startedAtMs = Date.now()
    const timings: VisionIndexTimings = { planningMs: 0, modelLoadingMs: 0, framesMs: 0, vectorIndexMs: 0, textIndexMs: 0, totalMs: 0 }
    let activeStage: VisionIndexStage | null = null
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
        const snapshot = await this.getVideoSourceSnapshot(videoPath, options.subtitlePaths?.get(videoPath))
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

      const ffmpegPath = fullPlans.length > 0 ? await resolveFfmpegPath(this.options.resourcePath, this.options.env, undefined) : null
      const ffprobePath = fullPlans.length > 0 ? await resolveFfprobePath(this.options.resourcePath, this.options.env, undefined) : null
      if (fullPlans.length > 0 && (!ffmpegPath || !ffprobePath)) throw new Error('未找到 ffmpeg 或 ffprobe，无法进行视频抽帧')
      if (fullPlans.length > 0 && !this.model.isAvailable()) throw new Error(this.model.getStatusMessage())

      if (fullPlans.length > 0) {
        emitProgress({ status: 'loading', stage: 'loading-model', totalVideos: paths.length, currentVideoIndex: skippedVideos + captionOnlyVideos, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在加载 SigLIP2 模型…' })
        await this.model.prepareImageModel()
      }
      for (let index = 0; index < fullPlans.length; index += 1) {
        throwIfAborted(signal)
        const plan = fullPlans[index]
        const currentVideoIndex = skippedVideos + captionOnlyVideos + index + 1
        emitProgress({ status: 'indexing', stage: 'frames', totalVideos: paths.length, currentVideoIndex, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, currentVideoPath: plan.path, message: `正在处理 ${basename(plan.path)}` })
        const frameCount = await this.indexVideo(plan.path, plan.snapshot, interval, ffmpegPath as string, ffprobePath as string, signal, (videoProcessed, videoTotal) => {
          emitProgress({ status: 'indexing', stage: 'frames', totalVideos: paths.length, currentVideoIndex, totalFrames: totalFrames + videoTotal, processedFrames: processedFrames + videoProcessed, skippedVideos, captionOnlyVideos, currentVideoPath: plan.path, message: `正在处理 ${basename(plan.path)}` })
        })
        processedFrames += frameCount
        totalFrames += frameCount
      }
      if (fullPlans.length > 0) {
        throwIfAborted(signal)
        emitProgress({ status: 'indexing', stage: 'vector-index', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在维护向量 ANN 索引…' })
        await this.ensureVectorIndex(true)
        throwIfAborted(signal)
      }
      if (fullPlans.length > 0 || captionOnlyVideos > 0) {
        throwIfAborted(signal)
        emitProgress({ status: 'indexing', stage: 'text-index', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '正在维护全文索引…' })
        await this.maintainSearchFullTextIndex()
        throwIfAborted(signal)
      }
      return emitProgress({ status: 'completed', stage: 'completed', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: `索引完成，共处理 ${processedFrames} 个视频帧，跳过 ${skippedVideos} 个未变化视频，更新 ${captionOnlyVideos} 个字幕索引` })
    } catch (error) {
      if (isAbortError(error)) {
        return emitProgress({ status: 'cancelled', stage: 'cancelled', totalVideos: paths.length, currentVideoIndex: 0, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, message: '索引已取消' })
      }
      const message = error instanceof Error ? error.message : String(error)
      emitProgress({ status: 'error', stage: 'error', totalVideos: paths.length, currentVideoIndex: 0, totalFrames, processedFrames, skippedVideos, captionOnlyVideos, error: message, message })
      throw error
    }
  }

  private async search(embedding: number[], limit: number): Promise<VisionSearchResult[]> {
    await this.ensureVectorIndex(false)
    const table = await this.getTable()
    if (!table) return []
    const vectorQuery = table.search(embedding) as VectorQuery
    const rows = await vectorQuery
      .distanceType(VISION_VECTOR_DISTANCE_TYPE)
      .limit(clampLimit(limit))
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'model_id', 'model_variant', '_distance'])
      .toArray() as unknown as Array<Record<string, unknown>>
    return rows.map((item) => {
      const distance = Number(item._distance)
      const score = Number.isFinite(distance) ? Math.max(0, Math.min(1, 1 - distance)) : 0
      return {
        id: String(item.id),
        videoPath: String(item.video_path),
        fileName: String(item.file_name),
        timestampSeconds: Number(item.timestamp_seconds),
        thumbnailPath: String(item.thumbnail_path),
        score,
        visualScore: score,
        matchSource: 'visual',
        modelId: String(item.model_id),
        modelVariant: String(item.model_variant)
      }
    })
  }

  private async searchVisualCandidates(embedding: number[], limit: number): Promise<VisualSearchCandidate[]> {
    const results = await this.search(embedding, Math.min(100, Math.max(clampLimit(limit) * 4, 50)))
    const denominator = Math.max(1, results.length)
    return results.map((result, index) => ({
      result,
      visualRankScore: 1 - index / denominator
    }))
  }

  private async searchLexicalByScan(query: string, limit: number): Promise<LexicalSearchCandidate[]> {
    const candidates = new Map<string, LexicalSearchCandidate>()
    const captionTable = await this.getCaptionTable()
    if (captionTable) {
      const rows = await captionTable.query()
        .select(['id', 'video_path', 'file_name', 'frame_id', 'timestamp_seconds', 'thumbnail_path', 'text'])
        .limit(METADATA_SCAN_LIMIT)
        .toArray() as unknown as Array<Record<string, unknown>>
      for (const row of rows) {
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
          modelId: VISION_MODEL_ID,
          modelVariant: VISION_MODEL_VARIANT
        }
        candidates.set(id, { result, lexicalScore: match.score, matchSource: match.source })
      }
    }

    const frameTable = await this.getTable()
    if (frameTable) {
      const rows = await frameTable.query()
        .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'model_id', 'model_variant'])
        .limit(METADATA_SCAN_LIMIT)
        .toArray() as unknown as Array<Record<string, unknown>>
      for (const row of rows) {
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
      .sort((left, right) => right.lexicalScore - left.lexicalScore)
      .slice(0, Math.min(100, Math.max(clampLimit(limit) * 4, 50)))
  }

  private async searchLexical(query: string, limit: number): Promise<LexicalSearchCandidate[]> {
    try {
      const table = await this.ensureSearchDocuments()
      if (!table) return []
      const rows = await table.query()
        .fullTextSearch(query, { columns: SEARCH_TEXT_COLUMN })
        .select(['id', 'video_path', 'file_name', 'frame_id', 'timestamp_seconds', 'thumbnail_path', 'caption_text', '_score'])
        .limit(Math.min(100, Math.max(clampLimit(limit) * 4, 50)))
        .toArray() as unknown as Array<Record<string, unknown>>
      const candidates: LexicalSearchCandidate[] = []
      for (const row of rows) {
        const match = calculateVisionLexicalMatch(query, String(row.caption_text ?? ''), String(row.file_name ?? ''))
        if (!match) continue
        const result: VisionSearchResult = {
          id: String(row.frame_id ?? row.id),
          videoPath: String(row.video_path),
          fileName: String(row.file_name),
          timestampSeconds: Number(row.timestamp_seconds),
          thumbnailPath: String(row.thumbnail_path),
          score: match.score,
          lexicalScore: match.score,
          matchedText: match.matchedText,
          matchSource: match.source,
          modelId: VISION_MODEL_ID,
          modelVariant: VISION_MODEL_VARIANT
        }
        candidates.push({ result, lexicalScore: match.score, matchSource: match.source })
      }
      return candidates
        .sort((left, right) => right.lexicalScore - left.lexicalScore)
        .slice(0, Math.min(100, Math.max(clampLimit(limit) * 4, 50)))
    } catch {
      return this.searchLexicalByScan(query, limit)
    }
  }

  private async searchHybrid(embedding: number[], query: string, limit: number): Promise<VisionSearchResult[]> {
    const visualCandidates = await this.searchVisualCandidates(embedding, limit)
    const lexicalCandidates = await this.searchLexical(query, limit)
    const merged = new Map<string, { result: VisionSearchResult; visualRankScore: number; lexicalScore: number; matchSource: VisionMatchSource }>()

    for (const candidate of visualCandidates) {
      merged.set(candidate.result.id, {
        result: candidate.result,
        visualRankScore: candidate.visualRankScore,
        lexicalScore: 0,
        matchSource: 'visual'
      })
    }

    for (const candidate of lexicalCandidates) {
      const existing = merged.get(candidate.result.id)
      if (existing) {
        existing.lexicalScore = candidate.lexicalScore
        existing.matchSource = 'both'
        existing.result.matchedText = candidate.result.matchedText
      } else {
        merged.set(candidate.result.id, {
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

  async searchText(query: string, limit?: number, mode: VisionSearchMode = 'hybrid'): Promise<VisionSearchResult[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []
    const targetLimit = clampLimit(limit)
    const embedding = await this.model.getTextEmbedding(normalizedQuery)
    if (mode === 'visual') return this.search(embedding, targetLimit)
    return this.searchHybrid(embedding, normalizedQuery, targetLimit)
  }

  async searchImage(imagePath: string, limit?: number): Promise<VisionSearchResult[]> {
    const image = await stat(imagePath)
    if (!image.isFile()) throw new Error('以图搜图输入不是有效文件')
    return this.search(await this.model.getImageEmbedding(imagePath), clampLimit(limit))
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
