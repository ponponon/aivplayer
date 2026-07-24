import { app, ipcMain } from 'electron'
import { basename, extname, join } from 'node:path'
import { writeFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrSubtitleSummaryExportRequest, AsrSubtitleSummaryExportResult, AsrSubtitleSummaryRequest } from '../shared/media-types'
import { appendAsrDiagnosticLog, getAsrLogDirectoryPath, redactAsrErrorDetails } from '../core/ai/asr-diagnostics'
import { getAsrRuntime } from './desktop-services'
import { desktopState } from './desktop-state'
import { promptForSavePath } from './media-dialogs'
import { getAppCopy } from '../shared/i18n'
import { getCurrentLocale } from './desktop-settings'
import { SingleFlight } from '../core/ai/single-flight'

const summarySingleFlight = new SingleFlight<Awaited<ReturnType<ReturnType<typeof getAsrRuntime>['summarizeSubtitle']>>, AbortController>()

function summaryRequestKey(request: AsrSubtitleSummaryRequest): string {
  return JSON.stringify({
    mediaPath: request.mediaPath ?? '',
    subtitlePath: request.subtitlePath,
    sourceLanguage: request.sourceLanguage ?? 'auto',
    sourceType: request.sourceType ?? 'raw',
    targetLanguage: request.targetLanguage,
    mode: request.mode ?? 'quick',
    force: Boolean(request.force)
  })
}

function exportExtension(format: AsrSubtitleSummaryExportRequest['format']): string {
  return format === 'markdown' ? 'md' : format
}

function formatLabel(format: AsrSubtitleSummaryExportRequest['format'], copy: ReturnType<typeof getAppCopy>): string {
  return format === 'markdown' ? copy.summary.formatMarkdown : format === 'json' ? copy.summary.formatJson : copy.summary.formatText
}

function defaultSummaryFileName(fileName: string | undefined, format: AsrSubtitleSummaryExportRequest['format']): string {
  const source = fileName?.trim() || 'summary'
  const stem = basename(source, extname(source)).replace(/[^a-zA-Z0-9\u4e00-\u9fff._-]+/g, '-').replace(/^-+|-+$/g, '') || 'summary'
  return `${stem}-summary.${exportExtension(format)}`
}

function ensureExtension(filePath: string, format: AsrSubtitleSummaryExportRequest['format']): string {
  const extension = `.${exportExtension(format)}`
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`
}

export function registerAsrSummaryIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_SUMMARIZE_SUBTITLE, async (event, request: AsrSubtitleSummaryRequest) => {
    const logDirectoryPath = getAsrLogDirectoryPath(app.getPath('userData'))
    const senderId = event.sender.id
    const key = summaryRequestKey(request)
    if (!summarySingleFlight.has(key)) desktopState.summaryAbortControllers.get(senderId)?.abort()
    const flight = summarySingleFlight.start(key, () => {
      const controller = new AbortController()
      desktopState.summaryAbortControllers.set(senderId, controller)
      return {
        context: controller,
        task: async (sharedController) => {
          await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-summary-started', { subtitlePath: request.subtitlePath, sourceLanguage: request.sourceLanguage, sourceType: request.sourceType, targetLanguage: request.targetLanguage, mode: request.mode ?? 'quick' })
          try {
            const result = await getAsrRuntime().summarizeSubtitle(request, {
              signal: sharedController.signal,
              onProgress: (progress) => event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, progress)
            })
            await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-summary-finished', { subtitlePath: request.subtitlePath, targetLanguage: request.targetLanguage, mode: result.mode, success: result.success, canceled: result.canceled, message: result.message, summaryStats: result.summaryStats, errorDetails: redactAsrErrorDetails(result.errorDetails) })
            return result
          } catch (error) {
            await appendAsrDiagnosticLog(logDirectoryPath, 'subtitle-summary-threw', { subtitlePath: request.subtitlePath, targetLanguage: request.targetLanguage, message: error instanceof Error ? error.message : String(error) })
            throw error
          } finally {
            if (desktopState.summaryAbortControllers.get(senderId) === sharedController) desktopState.summaryAbortControllers.delete(senderId)
          }
        }
      }
    })
    if (flight.joined) desktopState.summaryAbortControllers.set(senderId, flight.context)
    try {
      return await flight.promise
    } finally {
      if (desktopState.summaryAbortControllers.get(senderId) === flight.context) desktopState.summaryAbortControllers.delete(senderId)
    }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_CANCEL_SUMMARY, (event) => {
    const controller = desktopState.summaryAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })
  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_SUMMARY_CACHE, (_event, request: AsrSubtitleSummaryRequest) => getAsrRuntime().resolveSubtitleSummaryCache(request))
  ipcMain.handle(IPC_CHANNELS.ASR_EXPORT_SUMMARY, async (_event, request: AsrSubtitleSummaryExportRequest): Promise<AsrSubtitleSummaryExportResult> => {
    const copy = getAppCopy(getCurrentLocale())
    if (!request.content.trim()) return { success: false, message: copy.summary.noContentToExport, format: request.format }
    const extension = exportExtension(request.format)
    const defaultPath = join(app.getPath('documents'), defaultSummaryFileName(request.defaultFileName, request.format))
    const selectedPath = await promptForSavePath({ title: copy.summary.exportTitle, defaultPath, buttonLabel: copy.summary.export, filters: [{ name: formatLabel(request.format, copy), extensions: [extension] }] })
    if (!selectedPath) return { success: false, canceled: true, message: copy.summary.exportCanceled, format: request.format }
    const filePath = ensureExtension(selectedPath, request.format)
    try {
      await writeFile(filePath, request.content, 'utf8')
      return { success: true, message: copy.summary.exported(formatLabel(request.format, copy)), format: request.format, filePath }
    } catch (error) {
      return { success: false, message: `${copy.summary.exportFailed}：${error instanceof Error ? error.message : String(error)}`, format: request.format }
    }
  })
}
