import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaFilmstripRequest, MediaFilmstripResult } from '../shared/media-types'
import { resolveFilmstripCache } from '../core/media/filmstrip-cache'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)
const MAX_FILMSTRIP_FRAMES = 32
const DEFAULT_FILMSTRIP_WIDTH = 320

function normalizeRequest(request: MediaFilmstripRequest): { mediaPath: string; timestampsSeconds: number[]; width: number; quality: number } | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim() || !Array.isArray(request.timestampsSeconds)) return null
  const timestampsSeconds = Array.from(new Set(request.timestampsSeconds.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0))).slice(0, MAX_FILMSTRIP_FRAMES)
  if (timestampsSeconds.length === 0) return null
  const width = typeof request.width === 'number' && Number.isFinite(request.width) ? Math.min(640, Math.max(96, Math.round(request.width))) : DEFAULT_FILMSTRIP_WIDTH
  const quality = typeof request.quality === 'number' && Number.isFinite(request.quality) ? Math.min(10, Math.max(2, Math.round(request.quality))) : 5
  return { mediaPath: request.mediaPath, timestampsSeconds, width, quality }
}

async function extractFrame(ffmpegPath: string, request: { mediaPath: string; timestampSeconds: number; width: number; quality: number }): Promise<Buffer | null> {
  try {
    const { stdout } = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(request.timestampSeconds), '-i', request.mediaPath, '-frames:v', '1', '-vf', `scale=${request.width}:-2`, '-q:v', String(request.quality), '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })
    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

export function registerFilmstripIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EXTRACT_MEDIA_FILMSTRIP, async (_event, request: MediaFilmstripRequest): Promise<MediaFilmstripResult> => {
    const normalized = normalizeRequest(request)
    if (!normalized) return { frames: [], cacheHit: false, generatedFrameCount: 0, cacheKey: null }
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { frames: [], cacheHit: false, generatedFrameCount: 0, cacheKey: null }
    const renderFrame = (timestampSeconds: number): Promise<Buffer | null> => extractFrame(ffmpegPath, { mediaPath: normalized.mediaPath, timestampSeconds, width: normalized.width, quality: normalized.quality })
    const result = normalizedRequestUsesCache(request) ? await resolveFilmstripCache({ cacheDirectory: join(app.getPath('userData'), 'trickplay'), mediaPath: normalized.mediaPath, timestampsSeconds: normalized.timestampsSeconds, width: normalized.width, quality: normalized.quality, renderFrame }) : await renderWithoutCache(normalized.timestampsSeconds, renderFrame)
    return {
      frames: result.frames.map((frame) => ({ sourceSeconds: frame.sourceSeconds, dataUrl: `data:image/jpeg;base64,${frame.buffer.toString('base64')}` })),
      cacheHit: result.cacheHit,
      generatedFrameCount: result.generatedFrameCount,
      cacheKey: result.cacheKey
    }
  })
}

function normalizedRequestUsesCache(request: MediaFilmstripRequest): boolean {
  return request.useCache !== false
}

async function renderWithoutCache(timestampsSeconds: number[], renderFrame: (timestampSeconds: number) => Promise<Buffer | null>): Promise<{ frames: Array<{ sourceSeconds: number; buffer: Buffer }>; cacheHit: boolean; generatedFrameCount: number; cacheKey: null }> {
  const frames: Array<{ sourceSeconds: number; buffer: Buffer }> = []
  for (let index = 0; index < timestampsSeconds.length; index += 3) {
    const batch = timestampsSeconds.slice(index, index + 3)
    const result = await Promise.all(batch.map((timestampSeconds) => renderFrame(timestampSeconds)))
    result.forEach((buffer, batchIndex) => { if (buffer) frames.push({ sourceSeconds: batch[batchIndex]!, buffer }) })
  }
  return { frames: frames.sort((left, right) => left.sourceSeconds - right.sourceSeconds), cacheHit: false, generatedFrameCount: frames.length, cacheKey: null }
}
