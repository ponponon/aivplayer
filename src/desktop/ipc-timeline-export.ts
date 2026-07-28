import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaClipExportResult, MediaTimelineExportRequest } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { buildTimelineExportDefaultVideoPath, runTimelineExport } from '../core/media/timeline-export'
import { createMediaProbeMetadata } from '../core/media/media-metadata'
import { createMediaFile } from './media/media-protocol'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { promptForSavePath } from './media-dialogs'
import { getCurrentLocale } from './desktop-settings'
import { resolveResourcePath } from './desktop-services'

export function registerTimelineExportIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_EXPORT_TIMELINE, async (_event, request: MediaTimelineExportRequest): Promise<MediaClipExportResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const resourcePath = resolveResourcePath()
    const ffmpegPath = await resolveFfmpegPath(resourcePath, process.env, undefined)
    if (!ffmpegPath) return { success: false, message: copy.runtime.ffmpegMissing, canceled: false }
    const durationSeconds = request.clips.reduce((total, clip) => total + Math.max(0, clip.endSeconds - clip.startSeconds), 0)
    const defaultVideoPath = buildTimelineExportDefaultVideoPath(request.mediaPath, request.clips.length, durationSeconds, request.mode)
    const selectedVideoPath = await promptForSavePath({ title: copy.runtimeDialog.clipExportSaveTitle, defaultPath: defaultVideoPath, buttonLabel: copy.runtimeDialog.clipExportSaveConfirm, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] })
    if (!selectedVideoPath) return { success: false, message: '', canceled: true }
    try {
      const mediaPaths = [...new Set(request.clips.map((clip) => clip.mediaPath))]
      const metadataEntries = await Promise.all(mediaPaths.map(async (mediaPath) => [mediaPath, await createMediaProbeMetadata(mediaPath, { resourcePath, env: process.env }).catch(() => null)] as const))
      const metadataByPath = new Map(metadataEntries)
      const primaryMetadata = metadataByPath.get(request.mediaPath)
      const clips = request.clips.map((clip) => {
        const metadata = metadataByPath.get(clip.mediaPath)
        return { ...clip, hasAudio: metadata == null ? undefined : metadata.audio !== null }
      })
      const result = await runTimelineExport({
        ffmpegPath,
        mediaPath: request.mediaPath,
        clips,
        outputVideoPath: selectedVideoPath,
        mode: request.mode,
        subtitlePath: request.subtitlePath,
        subtitleSrtPath: request.subtitleSrtPath,
        subtitleText: request.subtitleText,
        outputFormat: { width: request.targetWidth ?? primaryMetadata?.video?.width ?? undefined, height: request.targetHeight ?? primaryMetadata?.video?.height ?? undefined, frameRate: primaryMetadata?.video?.frameRate ?? undefined, audioSampleRate: 48000, audioChannels: 2 },
        getLocale: getCurrentLocale
      })
      const videoFile = createMediaFile(result.videoPath)
      const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null
      const message = request.mode === 'burn-subtitle' ? copy.runtime.clipExportBurnedSuccess : request.mode === 'external-subtitle' ? copy.runtime.clipExportWithSubtitleSuccess : copy.runtime.clipExportSuccess
      return { success: true, message, videoPath: result.videoPath, videoUrl: videoFile.url, subtitleSrtPath: subtitleSrtFile?.path, subtitleSrtUrl: subtitleSrtFile?.url }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error), canceled: false }
    }
  })
}
