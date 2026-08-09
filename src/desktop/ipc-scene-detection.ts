import { ipcMain } from 'electron'
import { DEFAULT_MIN_SCENE_DURATION_SECONDS, DEFAULT_SCENE_DETECTION_THRESHOLD } from '../core/media/scene-detection'
import { detectSceneCutTimestamps } from '../core/media/scene-detection-runtime'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaSceneDetectionRequest, MediaSceneDetectionResult } from '../shared/media-types'
import { resolveResourcePath } from './desktop-services'

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
      const cuts = await detectSceneCutTimestamps(ffmpegPath, normalized.mediaPath, normalized.threshold, normalized.minSceneDurationSeconds)
      return { success: true, message: 'Scene detection completed', cuts: cuts.map((timestampSeconds) => ({ timestampSeconds })) }
    } catch (error) {
      const output = error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string' ? error.stderr : ''
      return { success: false, message: output.trim().slice(-500) || 'Scene detection failed', cuts: [] }
    }
  })
}
