import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrSubtitleTranslationRequest, AsrTranslationServiceTestRequest } from '../shared/media-types'
import { appendAsrDiagnosticLog, getAsrLogDirectoryPath, readRecentAsrDiagnosticLogs, redactAsrErrorDetails } from '../core/ai/asr-diagnostics'
import { getBatchSubtitleLogDirectoryPath } from '../core/ai/batch-subtitle-manager'
import { createMediaFile } from './media/media-protocol'
import { openPathInDefaultApp } from './system/file-actions'
import { getAsrRuntime } from './desktop-services'
import { desktopState } from './desktop-state'

export function registerAsrTranslationIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_TRANSLATE_SUBTITLE, async (event, request: AsrSubtitleTranslationRequest) => {
    const logDirectoryPath = getAsrLogDirectoryPath(app.getPath('userData'))
    const controller = new AbortController()
    const senderId = event.sender.id
    desktopState.translationAbortControllers.get(senderId)?.abort()
    desktopState.translationAbortControllers.set(senderId, controller)
    await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-translation-started', { subtitlePath: request.subtitlePath, sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage })
    try {
      const result = await getAsrRuntime().translateSubtitle(request, { signal: controller.signal, onProgress: (progress) => event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, progress) })
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-translation-finished', { subtitlePath: request.subtitlePath, targetLanguage: request.targetLanguage, success: result.success, canceled: result.canceled, message: result.message, translationStats: result.translationStats, errorDetails: redactAsrErrorDetails(result.errorDetails) })
      if (!result.subtitlePath) return result
      const subtitleFile = createMediaFile(result.subtitlePath)
      const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null
      return { ...result, subtitleUrl: subtitleFile.url, subtitleSrtUrl: subtitleSrtFile?.url }
    } catch (error) {
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-translation-threw', { subtitlePath: request.subtitlePath, targetLanguage: request.targetLanguage, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      if (desktopState.translationAbortControllers.get(senderId) === controller) desktopState.translationAbortControllers.delete(senderId)
    }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_CANCEL_TRANSLATION, (event) => {
    const controller = desktopState.translationAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.ASR_TEST_TRANSLATION_SERVICE, async (_event, request: AsrTranslationServiceTestRequest) => {
    const logDirectoryPath = getAsrLogDirectoryPath(app.getPath('userData'))
    const result = await getAsrRuntime().testTranslationService(request)
    await appendAsrDiagnosticLog(logDirectoryPath, 'translation-service-test', { sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage, success: result.success, message: result.message, translationModel: result.translationModel, translationBaseUrlSummary: result.translationBaseUrlSummary, errorDetails: redactAsrErrorDetails(result.errorDetails) })
    return result
  })
  ipcMain.handle(IPC_CHANNELS.ASR_OPEN_LOG_DIRECTORY, async () => { const path = getAsrLogDirectoryPath(app.getPath('userData')); return openPathInDefaultApp(path) })
  ipcMain.handle(IPC_CHANNELS.ASR_GET_RECENT_LOGS, async () => {
    try {
      const entries = await readRecentAsrDiagnosticLogs([getAsrLogDirectoryPath(app.getPath('userData')), getBatchSubtitleLogDirectoryPath(app.getPath('userData'))])
      return { success: true, message: '', entries }
    } catch (error) { return { success: false, message: error instanceof Error ? error.message : String(error), entries: [] } }
  })
}
