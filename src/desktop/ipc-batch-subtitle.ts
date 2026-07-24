import { app, ipcMain } from 'electron'
import { mkdir } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { BatchSubtitleScanRequest, BatchSubtitleStartRequest } from '../shared/media-types'
import { getBatchSubtitleLogDirectoryPath } from '../core/ai/batch-subtitle-manager'
import { getBatchSubtitleManager } from './desktop-services'
import { listMediaFilesInDirectory } from './media-dialogs'
import { openPathInDefaultApp } from './system/file-actions'

export function registerBatchSubtitleIpc(): void {
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_SCAN_DIRECTORY, (_event, request: BatchSubtitleScanRequest) => listMediaFilesInDirectory(request.directoryPath, request.recursive === true))
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_GET_CURRENT, (event) => getBatchSubtitleManager(event.sender).getCurrent())
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_GET_HISTORY, (event) => getBatchSubtitleManager(event.sender).getHistory())
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_START, (event, request: BatchSubtitleStartRequest) => getBatchSubtitleManager(event.sender).start(request))
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_PAUSE, (event) => getBatchSubtitleManager(event.sender).pause())
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_RESUME, (event) => getBatchSubtitleManager(event.sender).resume())
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_CANCEL, (event) => getBatchSubtitleManager(event.sender).cancel())
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_RETRY_FAILED, (event, retryableOnly?: boolean) => getBatchSubtitleManager(event.sender).retryFailed(retryableOnly === true))
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_RETRY_HISTORY, (event, jobId: string, retryableOnly?: boolean) => getBatchSubtitleManager(event.sender).retryHistory(jobId, retryableOnly === true))
  ipcMain.handle(IPC_CHANNELS.BATCH_SUBTITLE_OPEN_LOG_DIRECTORY, async () => { const path = getBatchSubtitleLogDirectoryPath(app.getPath('userData')); await mkdir(path, { recursive: true }); return openPathInDefaultApp(path) })
}
