import { app, ipcMain } from 'electron'
import { readFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { MediaProbeMetadata } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { createMediaProbeMetadata } from './media/media-metadata'
import { createMediaFile, } from './media/media-protocol'
import { getNativePlayerStatus, stopNativePlayer } from './media/native-player'
import { listMediaFilesInDirectory, promptForDirectory, promptForMediaFiles, getInitialMediaFiles } from './media-dialogs'
import { isMediaFileAvailable } from './media/file-opening'
import { getCurrentLocale, loadAppSettings, saveAppSettings } from './main-settings'
import { resolveResourcePath } from './main-services'
import { mainState } from './main-state'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_FILES, () => promptForMediaFiles())
  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_DIRECTORY, async () => promptForDirectory({ title: getAppCopy(getCurrentLocale()).settingsDialog.general.selectFolderDialogTitle, defaultPath: mainState.currentAppSettings.media.defaultOpenDirectoryPath }))
  ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_PICKER, (_event, request: { title: string; defaultPath?: string | null }) => promptForDirectory(request))
  ipcMain.handle(IPC_CHANNELS.LIST_MEDIA_FILES_IN_DIRECTORY, (_event, directoryPath: string) => listMediaFilesInDirectory(directoryPath))
  ipcMain.handle(IPC_CHANNELS.CREATE_MEDIA_FILE, (_event, filePath: string) => createMediaFile(filePath))
  ipcMain.handle(IPC_CHANNELS.CHECK_MEDIA_FILE, (_event, filePath: string) => isMediaFileAvailable(filePath))
  ipcMain.handle(IPC_CHANNELS.READ_FILE_CONTENT, (_event, filePath: string): Promise<string> => readFile(filePath, 'utf-8'))
  ipcMain.handle(IPC_CHANNELS.GET_MEDIA_METADATA, (_event, filePath: string): Promise<MediaProbeMetadata | null> => createMediaProbeMetadata(filePath, { resourcePath: resolveResourcePath(), env: process.env }))
  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_MEDIA_FILES, () => getInitialMediaFiles())
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, async () => { await loadAppSettings(); return mainState.currentAppSettings })
  ipcMain.handle(IPC_CHANNELS.APP_SET_SETTINGS, (_event, settings) => saveAppSettings(settings))
  ipcMain.handle(IPC_CHANNELS.NATIVE_PLAYER_STATUS, () => getNativePlayerStatus(getCurrentLocale))
  ipcMain.handle(IPC_CHANNELS.STOP_NATIVE_PLAYER, () => stopNativePlayer(getCurrentLocale))
}
