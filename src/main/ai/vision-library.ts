import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import { promisify } from 'node:util'
import { connect, type Table, type VectorQuery } from '@lancedb/lancedb'
import { isVideoFilePath } from '../media/file-opening'
import { resolveFfmpegPath, resolveFfprobePath } from './whisper-cpp-runtime'
import { VisionEmbeddingRuntime } from './vision-model'
import {
  VISION_FRAME_INTERVAL_SECONDS,
  VISION_MODEL_ID,
  VISION_MODEL_VARIANT,
  type VisionIndexProgress,
  type VisionRuntimeStatus,
  type VisionSearchResult
} from '../../shared/vision-types'

const execFileAsync = promisify(execFile)
const TABLE_NAME = 'video_frames'

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

type VisionLibraryOptions = {
  userDataPath: string
  resourcePath: string
  env: NodeJS.ProcessEnv
}

type ProgressCallback = (progress: VisionIndexProgress) => void

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

  private async getTable(): Promise<Table | null> {
    const db = await this.getDatabase()
    const tableNames = await db.tableNames()
    if (!tableNames.includes(TABLE_NAME)) return null
    return db.openTable(TABLE_NAME)
  }

  private async countRows(): Promise<number> {
    const table = await this.getTable()
    if (!table) return 0
    const rows = await table.query().select(['id']).limit(1_000_000).toArray()
    return rows.length
  }

  async getStatus(): Promise<VisionRuntimeStatus> {
    const available = this.model.isAvailable()
    return {
      available,
      modelId: VISION_MODEL_ID,
      modelVariant: VISION_MODEL_VARIANT,
      modelDirectory: this.model.paths.modelDirectory,
      indexDirectory: this.indexDirectory,
      indexedFrameCount: await this.countRows(),
      message: available ? this.model.getStatusMessage() : this.model.getStatusMessage()
    }
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

  private async indexVideo(
    videoPath: string,
    intervalSeconds: number,
    ffmpegPath: string,
    ffprobePath: string,
    signal: AbortSignal,
    onProgress: (processedFrames: number, totalFrames: number) => void
  ): Promise<number> {
    throwIfAborted(signal)
    const file = await stat(videoPath)
    const durationSeconds = await probeDuration(ffprobePath, videoPath)
    const timestamps = getSampleTimestamps(durationSeconds, intervalSeconds)
    const rows: VisionFrameRow[] = []

    for (const timestampSeconds of timestamps) {
      throwIfAborted(signal)
      const frame = await extractJpegFrame(ffmpegPath, videoPath, timestampSeconds)
      const frameId = createFrameId(videoPath, file.mtimeMs, timestampSeconds)
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
        file_size_bytes: file.size,
        file_mtime_ms: file.mtimeMs
      })
      onProgress(rows.length, timestamps.length)
    }

    await this.replaceVideoRows(videoPath, rows)
    return rows.length
  }

  async indexVideos(
    mediaPaths: string[],
    intervalSeconds: number = VISION_FRAME_INTERVAL_SECONDS,
    signal: AbortSignal = new AbortController().signal,
    onProgress: ProgressCallback = () => undefined
  ): Promise<VisionIndexProgress> {
    const paths = Array.from(new Set(mediaPaths.filter((filePath) => isVideoFilePath(filePath))))
    const interval = Number.isFinite(intervalSeconds) && intervalSeconds > 0 ? intervalSeconds : VISION_FRAME_INTERVAL_SECONDS
    await ensureDirectory(this.thumbnailDirectory)
    const ffmpegPath = await resolveFfmpegPath(this.options.resourcePath, this.options.env, undefined)
    const ffprobePath = await resolveFfprobePath(this.options.resourcePath, this.options.env, undefined)
    if (!ffmpegPath || !ffprobePath) throw new Error('未找到 ffmpeg 或 ffprobe，无法进行视频抽帧')
    if (!this.model.isAvailable()) throw new Error(this.model.getStatusMessage())

    let processedFrames = 0
    let totalFrames = 0
    onProgress({ status: 'loading', totalVideos: paths.length, currentVideoIndex: 0, totalFrames, processedFrames, message: '正在加载 SigLIP2 模型…' })

    try {
      for (let index = 0; index < paths.length; index += 1) {
        throwIfAborted(signal)
        const currentVideoPath = paths[index]
        onProgress({ status: 'indexing', totalVideos: paths.length, currentVideoIndex: index + 1, totalFrames, processedFrames, currentVideoPath, message: `正在处理 ${basename(currentVideoPath)}` })
        const frameCount = await this.indexVideo(currentVideoPath, interval, ffmpegPath, ffprobePath, signal, (videoProcessed, videoTotal) => {
          const currentTotalFrames = totalFrames + videoTotal
          onProgress({ status: 'indexing', totalVideos: paths.length, currentVideoIndex: index + 1, totalFrames: currentTotalFrames, processedFrames: processedFrames + videoProcessed, currentVideoPath, message: `正在处理 ${basename(currentVideoPath)}` })
        })
        processedFrames += frameCount
        totalFrames += frameCount
      }
      const result = { status: 'completed', totalVideos: paths.length, currentVideoIndex: paths.length, totalFrames, processedFrames, message: `索引完成，共处理 ${processedFrames} 个视频帧` } satisfies VisionIndexProgress
      onProgress(result)
      return result
    } catch (error) {
      if (isAbortError(error)) {
        const result = { status: 'cancelled', totalVideos: paths.length, currentVideoIndex: 0, totalFrames, processedFrames, message: '索引已取消' } satisfies VisionIndexProgress
        onProgress(result)
        return result
      }
      const message = error instanceof Error ? error.message : String(error)
      const result = { status: 'error', totalVideos: paths.length, currentVideoIndex: 0, totalFrames, processedFrames, error: message, message } satisfies VisionIndexProgress
      onProgress(result)
      throw error
    }
  }

  private async search(embedding: number[], limit: number): Promise<VisionSearchResult[]> {
    const table = await this.getTable()
    if (!table) return []
    const vectorQuery = table.search(embedding) as VectorQuery
    const rows = await vectorQuery
      .distanceType('cosine')
      .limit(clampLimit(limit))
      .select(['id', 'video_path', 'file_name', 'timestamp_seconds', 'thumbnail_path', 'model_id', 'model_variant', '_distance'])
      .toArray() as unknown as Array<Record<string, unknown>>
    return rows.map((item) => {
      const distance = Number(item._distance)
      return {
        id: String(item.id),
        videoPath: String(item.video_path),
        fileName: String(item.file_name),
        timestampSeconds: Number(item.timestamp_seconds),
        thumbnailPath: String(item.thumbnail_path),
        score: Number.isFinite(distance) ? 1 - distance : 0,
        modelId: String(item.model_id),
        modelVariant: String(item.model_variant)
      }
    })
  }

  async searchText(query: string, limit?: number): Promise<VisionSearchResult[]> {
    const normalizedQuery = query.trim()
    if (!normalizedQuery) return []
    return this.search(await this.model.getTextEmbedding(normalizedQuery), clampLimit(limit))
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
