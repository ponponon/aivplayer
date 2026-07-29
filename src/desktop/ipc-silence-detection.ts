import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import { DEFAULT_MIN_SILENCE_DURATION_SECONDS, DEFAULT_SILENCE_NOISE_DB, DEFAULT_SILENCE_PADDING_SECONDS, parseSilenceIntervals } from '../core/media/silence-detection'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaSilenceDetectionRequest, MediaSilenceDetectionResult } from '../shared/media-types'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)

function normalizeRequest(request: MediaSilenceDetectionRequest): { mediaPath: string; durationSeconds?: number; noiseDb: number; minSilenceDurationSeconds: number; paddingSeconds: number } | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) return null
  const durationSeconds = typeof request.durationSeconds === 'number' && Number.isFinite(request.durationSeconds) ? Math.max(0, request.durationSeconds) : undefined
  const noiseDb = typeof request.noiseDb === 'number' && Number.isFinite(request.noiseDb) ? Math.min(-10, Math.max(-60, request.noiseDb)) : DEFAULT_SILENCE_NOISE_DB
  const minSilenceDurationSeconds = typeof request.minSilenceDurationSeconds === 'number' && Number.isFinite(request.minSilenceDurationSeconds) ? Math.min(10, Math.max(0.1, request.minSilenceDurationSeconds)) : DEFAULT_MIN_SILENCE_DURATION_SECONDS
  const paddingSeconds = typeof request.paddingSeconds === 'number' && Number.isFinite(request.paddingSeconds) ? Math.min(0.5, Math.max(0, request.paddingSeconds)) : DEFAULT_SILENCE_PADDING_SECONDS
  return { mediaPath: request.mediaPath, durationSeconds, noiseDb, minSilenceDurationSeconds, paddingSeconds }
}

export function registerSilenceDetectionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DETECT_MEDIA_SILENCE, async (_event, request: MediaSilenceDetectionRequest): Promise<MediaSilenceDetectionResult> => {
    const normalized = normalizeRequest(request)
    if (!normalized) return { success: false, message: 'Invalid silence detection request', intervals: [] }
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { success: false, message: 'FFmpeg is unavailable', intervals: [] }
    try {
      const filter = `silencedetect=noise=${normalized.noiseDb}dB:d=${normalized.minSilenceDurationSeconds}`
      const { stdout, stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'info', '-i', normalized.mediaPath, '-af', filter, '-vn', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 })
      const intervals = parseSilenceIntervals(`${stdout}\n${stderr}`, normalized)
      return { success: true, message: 'Silence detection completed', intervals }
    } catch (error) {
      const output = error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
      return { success: false, message: output.trim().slice(-500) || 'Silence detection failed', intervals: [] }
    }
  })
}
