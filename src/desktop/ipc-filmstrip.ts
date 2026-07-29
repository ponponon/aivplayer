import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaFilmstripFrame, MediaFilmstripRequest, MediaFilmstripResult } from '../shared/media-types'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)
const MAX_FILMSTRIP_FRAMES = 24
const DEFAULT_FILMSTRIP_WIDTH = 320

function normalizeRequest(request: MediaFilmstripRequest): { mediaPath: string; timestampsSeconds: number[]; width: number; quality: number } | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim() || !Array.isArray(request.timestampsSeconds)) return null
  const timestampsSeconds = Array.from(new Set(request.timestampsSeconds.filter((value): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0))).slice(0, MAX_FILMSTRIP_FRAMES)
  if (timestampsSeconds.length === 0) return null
  const width = typeof request.width === 'number' && Number.isFinite(request.width) ? Math.min(640, Math.max(96, Math.round(request.width))) : DEFAULT_FILMSTRIP_WIDTH
  const quality = typeof request.quality === 'number' && Number.isFinite(request.quality) ? Math.min(10, Math.max(2, Math.round(request.quality))) : 5
  return { mediaPath: request.mediaPath, timestampsSeconds, width, quality }
}

async function extractFrame(ffmpegPath: string, request: { mediaPath: string; timestampSeconds: number; width: number; quality: number }): Promise<MediaFilmstripFrame | null> {
  try {
    const { stdout } = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-ss', String(request.timestampSeconds), '-i', request.mediaPath, '-frames:v', '1', '-vf', `scale=${request.width}:-2`, '-q:v', String(request.quality), '-f', 'image2pipe', '-vcodec', 'mjpeg', 'pipe:1'], { encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 })
    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
    return buffer.length > 0 ? { sourceSeconds: request.timestampSeconds, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` } : null
  } catch {
    return null
  }
}

export function registerFilmstripIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EXTRACT_MEDIA_FILMSTRIP, async (_event, request: MediaFilmstripRequest): Promise<MediaFilmstripResult> => {
    const normalized = normalizeRequest(request)
    if (!normalized) return { frames: [] }
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { frames: [] }
    const frames: MediaFilmstripFrame[] = []
    for (let index = 0; index < normalized.timestampsSeconds.length; index += 3) {
      const batch = normalized.timestampsSeconds.slice(index, index + 3)
      const result = await Promise.all(batch.map((timestampSeconds) => extractFrame(ffmpegPath, { mediaPath: normalized.mediaPath, timestampSeconds, width: normalized.width, quality: normalized.quality })))
      frames.push(...result.filter((frame): frame is MediaFilmstripFrame => frame !== null))
    }
    return { frames: frames.sort((left, right) => left.sourceSeconds - right.sourceSeconds) }
  })
}
