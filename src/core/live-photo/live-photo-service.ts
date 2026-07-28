import { copyFile, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import { tmpdir } from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { LivePhotoEditOptions, LivePhotoExportResult, LivePhotoFormat, LivePhotoProbeResult } from '../../shared/live-photo-types'
import { mergeJpegCoverMetadata } from './jpeg-cover.ts'
import { parseEmbeddedMotionPhoto, replaceGoogleMotionPhotoLengths, updateGoogleMotionPhotoPresentationTimestamp, updateXiaomiLivePhotoTimeline } from './live-photo-parser.ts'

const execFileAsync = promisify(execFile)
const livePhotoTempPaths = new Set<string>()

type MotionPhotoSource = {
  format: LivePhotoFormat
  sourcePath: string
  motionPath: string
  sourceBuffer: Buffer
  embedded?: {
    sourceBuffer: Buffer
    motionOffset: number
    metadataVersion?: number
    metadataSummary?: string
    videoPresentationTimestampUs?: number
  }
}

type ProbeVideoInfo = {
  durationSeconds: number
  hasAudio: boolean
  width: number
  height: number
}

function formatLabel(format: LivePhotoFormat): string {
  if (format === 'xiaomi') return '小米 Live Photo'
  if (format === 'apple-live-photo') return 'Apple Live Photo'
  return 'Google Motion Photo'
}

function isFilePath(path: string): boolean {
  try {
    return Boolean(path) && path.length > 0
  } catch {
    return false
  }
}

async function findAppleSidecar(sourcePath: string): Promise<string | null> {
  const extension = extname(sourcePath).toLowerCase()
  if (!['.heic', '.heif', '.jpg', '.jpeg'].includes(extension)) return null
  const stem = sourcePath.slice(0, -extension.length)
  for (const candidate of [`${stem}.mov`, `${stem}.MOV`, `${stem}.mp4`, `${stem}.MP4`]) {
    try {
      const candidateStat = await stat(candidate)
      if (candidateStat.isFile()) return candidate
    } catch {
      // Try the next case/extension variant.
    }
  }
  return null
}

async function resolveMotionPhotoSource(sourcePath: string): Promise<MotionPhotoSource | null> {
  const sourceBuffer = await readFile(sourcePath)
  const parsed = parseEmbeddedMotionPhoto(sourceBuffer, sourcePath)
  if (parsed) {
    const tempDir = await mkdtemp(join(tmpdir(), 'aivplayer-live-photo-'))
    const motionPath = join(tempDir, 'motion.mp4')
    await writeFile(motionPath, parsed.motionBytes)
    livePhotoTempPaths.add(tempDir)
    return {
      format: parsed.format,
      sourcePath,
      motionPath,
      sourceBuffer,
      embedded: {
        sourceBuffer,
        motionOffset: parsed.motionOffset,
        metadataVersion: parsed.metadataVersion,
        metadataSummary: parsed.metadataSummary,
        videoPresentationTimestampUs: parsed.videoPresentationTimestampUs
      }
    }
  }
  const sidecarPath = await findAppleSidecar(sourcePath)
  if (!sidecarPath) return null
  return { format: 'apple-live-photo', sourcePath, motionPath: sidecarPath, sourceBuffer }
}

async function probeVideo(ffprobePath: string, motionPath: string): Promise<ProbeVideoInfo> {
  const { stdout } = await execFileAsync(ffprobePath, [
    '-v', 'error',
    '-show_streams',
    '-show_format',
    '-of', 'json',
    motionPath
  ], { maxBuffer: 2 * 1024 * 1024 })
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ codec_type?: string; width?: number; height?: number; duration?: string }>
    format?: { duration?: string }
  }
  const videoStream = parsed.streams?.find((stream) => stream.codec_type === 'video')
  const duration = Number(videoStream?.duration ?? parsed.format?.duration ?? 0)
  return {
    durationSeconds: Number.isFinite(duration) ? Math.max(0, duration) : 0,
    hasAudio: Boolean(parsed.streams?.some((stream) => stream.codec_type === 'audio')),
    width: Number(videoStream?.width ?? 0),
    height: Number(videoStream?.height ?? 0)
  }
}

export async function probeLivePhotoFile(options: {
  ffprobePath: string
  sourcePath: string
}): Promise<{ result: Omit<LivePhotoProbeResult, 'motionUrl'>; motionPath: string } | null> {
  if (!isFilePath(options.sourcePath)) return null
  const source = await resolveMotionPhotoSource(options.sourcePath)
  if (!source) return null
  const videoInfo = await probeVideo(options.ffprobePath, source.motionPath)
  return {
    motionPath: source.motionPath,
    result: {
      format: source.format,
      formatLabel: formatLabel(source.format),
      sourcePath: source.sourcePath,
      motionPath: source.motionPath,
      durationSeconds: videoInfo.durationSeconds,
      hasAudio: videoInfo.hasAudio,
      videoWidth: videoInfo.width,
      videoHeight: videoInfo.height,
      metadataVersion: source.embedded?.metadataVersion,
      metadataSummary: source.embedded?.metadataSummary,
      videoPresentationTimestampUs: source.embedded?.videoPresentationTimestampUs
    }
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

function numberForFilter(value: number): string {
  return clamp(value, 0, 1).toFixed(5)
}

function createVideoFilter(options: LivePhotoEditOptions): string | null {
  const filters: string[] = []
  const cropScale = clamp(options.cropScale, 0.1, 1)
  if (cropScale < 0.999) filters.push(`crop=iw*${numberForFilter(cropScale)}:ih*${numberForFilter(cropScale)}:(iw-ow)/2:(ih-oh)/2`)
  const mosaic = options.mosaic
  if (mosaic.enabled) {
    const x = numberForFilter(mosaic.x)
    const y = numberForFilter(mosaic.y)
    const width = numberForFilter(Math.min(mosaic.width, 1 - Number(x)))
    const height = numberForFilter(Math.min(mosaic.height, 1 - Number(y)))
    filters.push(`split=2[base][mosaic];[mosaic]crop=iw*${width}:ih*${height}:iw*${x}:ih*${y},scale=iw/16:ih/16:flags=neighbor,scale=iw*16:ih*16:flags=neighbor[pixel];[base][pixel]overlay=W*${x}:H*${y}`)
  }
  return filters.length > 0 ? filters.join(',') : null
}

async function renderMotionVideo(options: {
  ffmpegPath: string
  sourcePath: string
  outputPath: string
  edit: LivePhotoEditOptions
}): Promise<void> {
  const startSeconds = Math.max(0, Number.isFinite(options.edit.startSeconds) ? options.edit.startSeconds : 0)
  const durationSeconds = Math.max(0.1, Number.isFinite(options.edit.durationSeconds) ? options.edit.durationSeconds : 0.1)
  const args = ['-hide_banner', '-y', '-ss', String(startSeconds), '-i', options.sourcePath, '-t', String(durationSeconds)]
  const filter = createVideoFilter(options.edit)
  if (filter) args.push('-vf', filter)
  args.push('-map', '0:v:0', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-pix_fmt', 'yuv420p')
  if (options.edit.mute) {
    args.push('-an')
  } else {
    args.push('-map', '0:a:0?', '-c:a', 'aac', '-b:a', '128k')
  }
  args.push('-map_metadata', '0', '-movflags', '+faststart', options.outputPath)
  await execFileAsync(options.ffmpegPath, args, { maxBuffer: 2 * 1024 * 1024 })
}

async function extractVideoFrame(options: { ffmpegPath: string; sourcePath: string; outputPath: string; timestampSeconds: number }): Promise<void> {
  await execFileAsync(options.ffmpegPath, [
    '-hide_banner', '-y',
    '-ss', String(Math.max(0, options.timestampSeconds)),
    '-i', options.sourcePath,
    '-frames:v', '1',
    '-q:v', '2',
    options.outputPath
  ], { maxBuffer: 2 * 1024 * 1024 })
}

function buildAppleMotionPath(outputPath: string): string {
  const extension = extname(outputPath)
  return `${outputPath.slice(0, -extension.length)}.mov`
}

function decodeDataUrl(dataUrl: string | undefined): Buffer | null {
  if (!dataUrl) return null
  const separator = dataUrl.indexOf(',')
  if (separator < 0) return null
  try { return Buffer.from(dataUrl.slice(separator + 1), 'base64') } catch { return null }
}

function canMergeJpegCover(sourcePath: string, sourceBuffer: Buffer, coverBytes: Buffer | null): boolean {
  return Boolean(coverBytes && sourceBuffer[0] === 0xff && sourceBuffer[1] === 0xd8 && ['.jpg', '.jpeg'].includes(extname(sourcePath).toLowerCase()) && coverBytes[0] === 0xff && coverBytes[1] === 0xd8)
}

export async function editAndExportLivePhoto(options: {
  ffmpegPath: string
  sourcePath: string
  outputPath: string
  edit: LivePhotoEditOptions
  coverDataUrl?: string
}): Promise<LivePhotoExportResult> {
  const source = await resolveMotionPhotoSource(options.sourcePath)
  if (!source) throw new Error('未找到 Live Photo 的视频部分')
  const tempDir = await mkdtemp(join(tmpdir(), 'aivplayer-live-photo-export-'))
  try {
    const editedMotionPath = join(tempDir, source.format === 'apple-live-photo' ? 'edited-motion.mov' : 'edited-motion.mp4')
    await renderMotionVideo({ ffmpegPath: options.ffmpegPath, sourcePath: source.motionPath, outputPath: editedMotionPath, edit: options.edit })
    const editedMotionBytes = await readFile(editedMotionPath)
    let renderedCoverBytes = decodeDataUrl(options.coverDataUrl)
    if (options.edit.coverTimestampSeconds !== null && options.edit.coverTimestampSeconds !== undefined) {
      const framePath = join(tempDir, 'selected-cover.jpg')
      await extractVideoFrame({ ffmpegPath: options.ffmpegPath, sourcePath: editedMotionPath, outputPath: framePath, timestampSeconds: options.edit.coverTimestampSeconds })
      renderedCoverBytes = await readFile(framePath)
    }
    if (source.embedded) {
      let imageBytes = source.embedded.sourceBuffer.subarray(0, source.embedded.motionOffset)
      if (canMergeJpegCover(source.sourcePath, imageBytes, renderedCoverBytes)) imageBytes = mergeJpegCoverMetadata(imageBytes, renderedCoverBytes as Buffer)
      if (source.format === 'google-motion-photo') {
        imageBytes = replaceGoogleMotionPhotoLengths(imageBytes, renderedCoverBytes ? imageBytes.length : undefined, editedMotionBytes.length)
        imageBytes = updateGoogleMotionPhotoPresentationTimestamp(imageBytes, options.edit.startSeconds, options.edit.coverTimestampSeconds)
      }
      if (source.format === 'xiaomi') imageBytes = updateXiaomiLivePhotoTimeline(imageBytes, options.edit.startSeconds, options.edit.durationSeconds, options.edit.coverTimestampSeconds)
      await writeFile(options.outputPath, Buffer.concat([imageBytes, editedMotionBytes]))
      return { success: true, filePath: options.outputPath, message: 'Live Photo 导出完成', format: source.format }
    }
    if (canMergeJpegCover(source.sourcePath, source.sourceBuffer, renderedCoverBytes)) await writeFile(options.outputPath, mergeJpegCoverMetadata(source.sourceBuffer, renderedCoverBytes as Buffer))
    else await copyFile(source.sourcePath, options.outputPath)
    const motionOutputPath = buildAppleMotionPath(options.outputPath)
    await writeFile(motionOutputPath, editedMotionBytes)
    return { success: true, filePath: options.outputPath, motionPath: motionOutputPath, message: 'Apple Live Photo 导出完成', format: source.format }
  } finally {
    await import('node:fs/promises').then(({ rm }) => rm(tempDir, { recursive: true, force: true })).catch(() => {})
  }
}

export function getLivePhotoTempPaths(): string[] {
  return Array.from(livePhotoTempPaths)
}

export function getLivePhotoDefaultName(sourcePath: string): string {
  const extension = extname(sourcePath) || '.jpg'
  return `${basename(sourcePath, extension)}-edited${extension}`
}

export function getLivePhotoDefaultDirectory(sourcePath: string): string {
  return dirname(sourcePath)
}
