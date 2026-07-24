import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrSubtitleExportRequest, AsrSubtitleExportResult, AsrSubtitleRequest, AsrSubtitleTranslationRequest, AsrSubtitleTranslationResult } from '../shared/media-types'
import { appendAsrDiagnosticLog, getAsrLogDirectoryPath, redactAsrErrorDetails } from '../core/ai/asr-diagnostics'
import { createMediaFile } from './media/media-protocol'
import { getAsrRuntime } from './desktop-services'
import { desktopState } from './desktop-state'
import { app } from 'electron'

function withSubtitleUrls<T extends { subtitlePath?: string; subtitleSrtPath?: string }>(result: T): T & { subtitleUrl?: string; subtitleSrtUrl?: string } {
  if (!result.subtitlePath) return result
  const subtitleFile = createMediaFile(result.subtitlePath)
  const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null
  return { ...result, subtitleUrl: subtitleFile.url, subtitleSrtUrl: subtitleSrtFile?.url }
}

export function registerAsrSubtitleIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_GENERATE_SUBTITLE, async (event, request: AsrSubtitleRequest) => {
    const logDirectoryPath = getAsrLogDirectoryPath(app.getPath('userData'))
    const controller = new AbortController()
    desktopState.asrAbortControllers.get(event.sender.id)?.abort()
    desktopState.asrAbortControllers.set(event.sender.id, controller)
    await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-generation-started', { mediaPath: request.mediaPath, modelId: request.modelId, language: request.language })
    try {
      const result = await getAsrRuntime().generateSubtitle(request, (progress) => event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, progress), { signal: controller.signal })
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-generation-finished', { mediaPath: request.mediaPath, success: result.success, message: result.message, subtitlePath: result.subtitlePath, generationStats: result.generationStats, errorDetails: redactAsrErrorDetails(result.errorDetails) })
      return withSubtitleUrls(result)
    } catch (error) {
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-generation-threw', { mediaPath: request.mediaPath, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      if (desktopState.asrAbortControllers.get(event.sender.id) === controller) desktopState.asrAbortControllers.delete(event.sender.id)
    }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_CANCEL_SUBTITLE, (event) => {
    const controller = desktopState.asrAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_CACHE, async (_event, request: AsrSubtitleRequest) => withSubtitleUrls(await getAsrRuntime().resolveSubtitleCache(request)))
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_TRANSLATED_SUBTITLE_CACHE, async (_event, request: AsrSubtitleTranslationRequest) => withSubtitleUrls(await getAsrRuntime().resolveTranslatedSubtitleCache(request)) satisfies AsrSubtitleTranslationResult)
  ipcMain.handle(IPC_CHANNELS.ASR_EXPORT_SUBTITLE_SRT, async (_event, request: AsrSubtitleExportRequest) => {
    const result = await getAsrRuntime().exportSubtitleSrt(request)
    if (!result.subtitleSrtPath) return result
    const subtitleSrtFile = createMediaFile(result.subtitleSrtPath)
    return { ...result, subtitleSrtUrl: subtitleSrtFile.url } satisfies AsrSubtitleExportResult
  })
}
