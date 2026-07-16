import { app, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrSubtitleSummaryRequest } from '../shared/media-types'
import { appendAsrDiagnosticLog, getAsrLogDirectoryPath, redactAsrErrorDetails } from './ai/asr-diagnostics'
import { getAsrRuntime } from './main-services'
import { mainState } from './main-state'

export function registerAsrSummaryIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_SUMMARIZE_SUBTITLE, async (event, request: AsrSubtitleSummaryRequest) => {
    const logDirectoryPath = getAsrLogDirectoryPath(app.getPath('userData'))
    const controller = new AbortController()
    const senderId = event.sender.id
    mainState.summaryAbortControllers.get(senderId)?.abort()
    mainState.summaryAbortControllers.set(senderId, controller)
    await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-summary-started', { subtitlePath: request.subtitlePath, sourceLanguage: request.sourceLanguage, targetLanguage: request.targetLanguage })
    try {
      const result = await getAsrRuntime().summarizeSubtitle(request, {
        signal: controller.signal,
        onProgress: (progress) => event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, progress)
      })
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-summary-finished', { subtitlePath: request.subtitlePath, targetLanguage: request.targetLanguage, success: result.success, canceled: result.canceled, message: result.message, summaryStats: result.summaryStats, errorDetails: redactAsrErrorDetails(result.errorDetails) })
      return result
    } catch (error) {
      await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-summary-threw', { subtitlePath: request.subtitlePath, targetLanguage: request.targetLanguage, message: error instanceof Error ? error.message : String(error) })
      throw error
    } finally {
      if (mainState.summaryAbortControllers.get(senderId) === controller) mainState.summaryAbortControllers.delete(senderId)
    }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_CANCEL_SUMMARY, (event) => {
    const controller = mainState.summaryAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_SUMMARY_CACHE, (_event, request: AsrSubtitleSummaryRequest) => getAsrRuntime().resolveSubtitleSummaryCache(request))
}
