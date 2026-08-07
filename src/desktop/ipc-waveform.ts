import { app, ipcMain } from 'electron'
import { execFile } from 'node:child_process'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { resolveWaveformCache } from '../core/media/waveform-cache'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaWaveformRequest, MediaWaveformResult } from '../shared/media-types'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)
const DEFAULT_WAVEFORM_WIDTH = 1200
const DEFAULT_WAVEFORM_HEIGHT = 64
const MAX_WAVEFORM_WIDTH = 2400

function normalizeRequest(request: MediaWaveformRequest): { mediaPath: string; width: number; height: number; useCache: boolean } | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) return null
  const width = typeof request.width === 'number' && Number.isFinite(request.width) ? Math.min(MAX_WAVEFORM_WIDTH, Math.max(240, Math.round(request.width))) : DEFAULT_WAVEFORM_WIDTH
  const height = typeof request.height === 'number' && Number.isFinite(request.height) ? Math.min(96, Math.max(24, Math.round(request.height))) : DEFAULT_WAVEFORM_HEIGHT
  return { mediaPath: request.mediaPath, width, height, useCache: request.useCache !== false }
}

async function renderWaveform(ffmpegPath: string, request: { mediaPath: string; width: number; height: number }): Promise<Buffer | null> {
  try {
    const filter = `[0:a]aformat=channel_layouts=mono,showwavespic=s=${request.width}x${request.height}:colors=0xf2c14eff:scale=sqrt:filter=peak[wave]`
    const { stdout } = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-i', request.mediaPath, '-filter_complex', filter, '-map', '[wave]', '-frames:v', '1', '-f', 'image2pipe', '-vcodec', 'png', 'pipe:1'], { encoding: 'buffer', maxBuffer: 8 * 1024 * 1024 })
    const buffer = Buffer.isBuffer(stdout) ? stdout : Buffer.from(stdout)
    return buffer.length > 0 ? buffer : null
  } catch {
    return null
  }
}

function failure(message: string): MediaWaveformResult {
  return { success: false, message, cacheHit: false, generated: false, cacheKey: null }
}

export function registerWaveformIpc(): void {
  ipcMain.handle(IPC_CHANNELS.EXTRACT_MEDIA_WAVEFORM, async (_event, request: MediaWaveformRequest): Promise<MediaWaveformResult> => {
    const normalized = normalizeRequest(request)
    if (!normalized) return failure('Invalid waveform request')
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return failure('FFmpeg is unavailable')
    const render = (): Promise<Buffer | null> => renderWaveform(ffmpegPath, normalized)
    const result = normalized.useCache
      ? await resolveWaveformCache({ cacheDirectory: join(app.getPath('userData'), 'waveform-cache'), mediaPath: normalized.mediaPath, width: normalized.width, height: normalized.height, renderWaveform: render })
      : (() => {
          const bufferPromise = render()
          return bufferPromise.then((buffer) => ({ buffer, cacheHit: false, generated: Boolean(buffer), cacheKey: null }))
        })()
    const resolved = await result
    if (!resolved.buffer) return failure('No audio track or waveform data was generated')
    return { success: true, message: 'ok', dataUrl: `data:image/png;base64,${resolved.buffer.toString('base64')}`, cacheHit: resolved.cacheHit, generated: resolved.generated, cacheKey: resolved.cacheKey }
  })
}
