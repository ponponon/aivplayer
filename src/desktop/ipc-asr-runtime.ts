import { dialog, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrModelSourceId, AsrRuntimeSetupResult } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { getAsrRuntime } from './desktop-services'
import { getCurrentLocale } from './desktop-settings'
import { desktopState } from './desktop-state'

export function registerAsrRuntimeIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_HEALTH_CHECK, () => getAsrRuntime().healthCheck())
  ipcMain.handle(IPC_CHANNELS.ASR_AUTO_DETECT_WHISPER_BINARY, async (): Promise<AsrRuntimeSetupResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const status = await getAsrRuntime().autoConfigureWhisperBinaryPath()
    return { success: Boolean(status.binaryPath), message: status.binaryPath ? copy.runtimeDialog.autoDetectSuccess(status.binaryPath) : copy.runtimeDialog.autoDetectMessage, status }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_SELECT_WHISPER_BINARY, async (): Promise<AsrRuntimeSetupResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const options: Electron.OpenDialogOptions = { title: copy.runtimeDialog.selectWhisperTitle, message: copy.runtimeDialog.selectWhisperMessage, properties: ['openFile'], filters: [{ name: 'whisper.cpp binary', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }, { name: 'All files', extensions: ['*'] }] }
    const result = desktopState.mainWindow ? await dialog.showOpenDialog(desktopState.mainWindow, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) return { success: false, canceled: true, message: copy.runtimeDialog.selectWhisperCancel }
    const binaryPath = result.filePaths[0]
    const status = await getAsrRuntime().configureWhisperBinaryPath(binaryPath)
    const normalized = status.binaryPath
    return { success: Boolean(normalized), message: normalized ? normalized === binaryPath ? copy.runtimeDialog.selectWhisperSuccess(binaryPath) : copy.runtimeDialog.selectWhisperCompatSuccess(normalized) : copy.runtimeDialog.selectWhisperFailed, status }
  })
  ipcMain.handle(IPC_CHANNELS.ASR_DOWNLOAD_MODEL, async (event, modelId?: string, sourceId?: AsrModelSourceId) => getAsrRuntime().downloadModel(modelId, sourceId, (progress) => event.sender.send(IPC_CHANNELS.ASR_MODEL_DOWNLOAD_PROGRESS, progress)))
}
