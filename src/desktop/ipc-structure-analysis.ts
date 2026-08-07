import { app, ipcMain } from 'electron'
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { buildMediaStructureSegments, DEFAULT_BLACK_PIXEL_THRESHOLD, DEFAULT_MIN_BLACK_DURATION_SECONDS, parseBlackIntervals } from '../core/media/structure-analysis'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaStructureAnalysisRequest, MediaStructureAnalysisResult } from '../shared/media-types'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)
const analysisQueues = new Map<string, Promise<MediaStructureAnalysisResult>>()

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 24)
}

function normalizeRequest(request: MediaStructureAnalysisRequest): { mediaPath: string; durationSeconds?: number; minBlackDurationSeconds: number; pixelThreshold: number } | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) return null
  const durationSeconds = typeof request.durationSeconds === 'number' && Number.isFinite(request.durationSeconds) ? Math.max(0, request.durationSeconds) : undefined
  const minBlackDurationSeconds = typeof request.minBlackDurationSeconds === 'number' && Number.isFinite(request.minBlackDurationSeconds) ? Math.min(10, Math.max(0.1, request.minBlackDurationSeconds)) : DEFAULT_MIN_BLACK_DURATION_SECONDS
  const pixelThreshold = typeof request.pixelThreshold === 'number' && Number.isFinite(request.pixelThreshold) ? Math.min(0.5, Math.max(0.001, request.pixelThreshold)) : DEFAULT_BLACK_PIXEL_THRESHOLD
  return { mediaPath: request.mediaPath, durationSeconds, minBlackDurationSeconds, pixelThreshold }
}

async function analyzeUnqueued(request: { mediaPath: string; durationSeconds?: number; minBlackDurationSeconds: number; pixelThreshold: number }): Promise<MediaStructureAnalysisResult> {
  let mediaStat
  try {
    mediaStat = await stat(request.mediaPath)
  } catch {
    return { success: false, message: 'Media file is unavailable', cacheHit: false, cacheKey: null, segments: [] }
  }
  const sourceFingerprint = hash(`${request.mediaPath}|${mediaStat.size}|${mediaStat.mtimeMs}`)
  const cacheKey = hash(`${sourceFingerprint}|${request.durationSeconds ?? ''}|${request.minBlackDurationSeconds}|${request.pixelThreshold}`)
  const cacheDirectory = join(app.getPath('userData'), 'media-analysis', 'structure')
  const cachePath = join(cacheDirectory, `${cacheKey}.json`)
  try {
    const cached = JSON.parse(await readFile(cachePath, 'utf8')) as { sourceFingerprint?: unknown; segments?: unknown }
    if (cached.sourceFingerprint === sourceFingerprint && Array.isArray(cached.segments)) return { success: true, message: 'Structure analysis loaded from cache', cacheHit: true, cacheKey, segments: cached.segments as MediaStructureAnalysisResult['segments'] }
  } catch {
    // A damaged analysis cache is regenerated below.
  }

  const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
  if (!ffmpegPath) return { success: false, message: 'FFmpeg is unavailable', cacheHit: false, cacheKey, segments: [] }
  try {
    const filter = `blackdetect=d=${request.minBlackDurationSeconds}:pix_th=${request.pixelThreshold}`
    const { stdout, stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'info', '-i', request.mediaPath, '-vf', filter, '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 })
    const intervals = parseBlackIntervals(`${stdout}\n${stderr}`, request.durationSeconds, request.minBlackDurationSeconds)
    const segments = buildMediaStructureSegments(intervals, request.durationSeconds)
    await mkdir(cacheDirectory, { recursive: true })
    const temporaryPath = `${cachePath}.${process.pid}.tmp`
    await writeFile(temporaryPath, `${JSON.stringify({ schemaVersion: 1, sourceFingerprint, mediaPath: request.mediaPath, sizeBytes: mediaStat.size, mtimeMs: mediaStat.mtimeMs, durationSeconds: request.durationSeconds, minBlackDurationSeconds: request.minBlackDurationSeconds, pixelThreshold: request.pixelThreshold, segments, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8')
    await rename(temporaryPath, cachePath)
    return { success: true, message: 'Structure analysis completed', cacheHit: false, cacheKey, segments }
  } catch (error) {
    const output = error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
    return { success: false, message: output.trim().slice(-500) || (error instanceof Error ? error.message : 'Structure analysis failed'), cacheHit: false, cacheKey, segments: [] }
  }
}

export function registerStructureAnalysisIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ANALYZE_MEDIA_STRUCTURE, async (_event, request: MediaStructureAnalysisRequest): Promise<MediaStructureAnalysisResult> => {
    const normalized = normalizeRequest(request)
    if (!normalized) return { success: false, message: 'Invalid structure analysis request', cacheHit: false, cacheKey: null, segments: [] }
    const queueKey = JSON.stringify(normalized)
    const previous = analysisQueues.get(queueKey) ?? Promise.resolve<MediaStructureAnalysisResult>({ success: false, message: 'No previous analysis', cacheHit: false, cacheKey: null, segments: [] })
    const next = previous.catch(() => ({ success: false, message: 'Previous analysis failed', cacheHit: false, cacheKey: null, segments: [] })).then(() => analyzeUnqueued(normalized))
    analysisQueues.set(queueKey, next)
    void next.then(() => { if (analysisQueues.get(queueKey) === next) analysisQueues.delete(queueKey) })
    return next
  })
}
