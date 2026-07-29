import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { ipcMain } from 'electron'
import { DEFAULT_MIN_SCENE_DURATION_SECONDS, DEFAULT_SCENE_DETECTION_THRESHOLD, parseSceneCutTimestamps } from '../core/media/scene-detection'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaSceneDetectionRequest, MediaSceneDetectionResult } from '../shared/media-types'
import { resolveResourcePath } from './desktop-services'

const execFileAsync = promisify(execFile)

function normalizeRequest(request: MediaSceneDetectionRequest): { mediaPath: string; threshold: number; minSceneDurationSeconds: number } | null {
  if (!request || typeof request.mediaPath !== 'string' || !request.mediaPath.trim()) return null
  const threshold = typeof request.threshold === 'number' && Number.isFinite(request.threshold)
    ? Math.min(0.95, Math.max(0.05, request.threshold))
    : DEFAULT_SCENE_DETECTION_THRESHOLD
  const minSceneDurationSeconds = typeof request.minSceneDurationSeconds === 'number' && Number.isFinite(request.minSceneDurationSeconds)
    ? Math.min(10, Math.max(0.1, request.minSceneDurationSeconds))
    : DEFAULT_MIN_SCENE_DURATION_SECONDS
  return { mediaPath: request.mediaPath, threshold, minSceneDurationSeconds }
}

export function registerSceneDetectionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.DETECT_MEDIA_SCENES, async (_event, request: MediaSceneDetectionRequest): Promise<MediaSceneDetectionResult> => {
    const normalized = normalizeRequest(request)
    if (!normalized) return { success: false, message: 'Invalid scene detection request', cuts: [] }
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { success: false, message: 'FFmpeg is unavailable', cuts: [] }
    try {
      const filter = `select='gt(scene,${normalized.threshold})',showinfo`
      const { stdout, stderr } = await execFileAsync(ffmpegPath, ['-hide_banner', '-loglevel', 'info', '-i', normalized.mediaPath, '-vf', filter, '-an', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 12 * 1024 * 1024 })
      const output = `${stdout}\n${stderr}`
      return { success: true, message: 'Scene detection completed', cuts: parseSceneCutTimestamps(output, normalized.minSceneDurationSeconds).map((timestampSeconds) => ({ timestampSeconds })) }
    } catch (error) {
      const output = error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
      return { success: false, message: output.trim().slice(-500) || 'Scene detection failed', cuts: [] }
    }
  })
}
