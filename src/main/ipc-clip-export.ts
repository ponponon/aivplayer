import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaClipExportRequest, MediaClipExportResult } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { buildClipExportDefaultVideoPath, runClipExport } from './media/clip-export'
import { createMediaFile } from './media/media-protocol'
import { resolveFfmpegPath } from './ai/whisper-cpp-runtime'
import { promptForSavePath } from './media-dialogs'
import { getCurrentLocale } from './main-settings'
import { resolveResourcePath } from './main-services'

export function registerClipExportIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_EXPORT_CLIP, async (_event, request: MediaClipExportRequest): Promise<MediaClipExportResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { success: false, message: copy.runtime.ffmpegMissing, canceled: false }
    const defaultVideoPath = buildClipExportDefaultVideoPath(request.mediaPath, request.startSeconds, request.durationSeconds, request.mode)
    const selectedVideoPath = await promptForSavePath({ title: copy.runtimeDialog.clipExportSaveTitle, defaultPath: defaultVideoPath, buttonLabel: copy.runtimeDialog.clipExportSaveConfirm, filters: [{ name: 'MP4 video', extensions: ['mp4'] }] })
    if (!selectedVideoPath) return { success: false, message: '', canceled: true }
    try {
      const result = await runClipExport({ ffmpegPath, mediaPath: request.mediaPath, outputVideoPath: selectedVideoPath, startSeconds: request.startSeconds, durationSeconds: request.durationSeconds, mode: request.mode, subtitlePath: request.subtitlePath, subtitleSrtPath: request.subtitleSrtPath, getLocale: getCurrentLocale })
      const videoFile = createMediaFile(result.videoPath)
      const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null
      const message = request.mode === 'burn-subtitle' ? copy.runtime.clipExportBurnedSuccess : request.mode === 'external-subtitle' ? copy.runtime.clipExportWithSubtitleSuccess : copy.runtime.clipExportSuccess
      return { success: true, message, videoPath: result.videoPath, videoUrl: videoFile.url, subtitleSrtPath: subtitleSrtFile?.path, subtitleSrtUrl: subtitleSrtFile?.url }
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : String(error), canceled: false } }
  })
}
