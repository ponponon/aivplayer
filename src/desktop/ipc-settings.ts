import { app, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ImageSaveRequest, ImageSaveResult, MediaProbeMetadata } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { createMediaProbeMetadata } from '../core/media/media-metadata'
import { createMediaFile, } from './media/media-protocol'
import { getNativePlayerStatus, stopNativePlayer } from '../core/media/native-player'
import { listMediaFilesInDirectory, promptForDirectory, promptForMediaFiles, promptForSavePath, getInitialMediaFiles } from './media-dialogs'
import { isMediaFileAvailable } from '../core/media/file-opening'
import { getCurrentLocale, loadAppSettings, saveAppSettings } from './desktop-settings'
import { resolveResourcePath } from './desktop-services'
import { desktopState } from './desktop-state'
import { findAvailableImagePath, sanitizeImageExtension, sanitizeImageFileName } from '../core/image-save-utils'

export function registerSettingsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_FILES, () => promptForMediaFiles())
  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_DIRECTORY, async () => promptForDirectory({ title: getAppCopy(getCurrentLocale()).settingsDialog.general.selectFolderDialogTitle, defaultPath: desktopState.currentAppSettings.media.defaultOpenDirectoryPath }))
  ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_PICKER, (_event, request: { title: string; defaultPath?: string | null }) => {
    const smokeImageOutputDirectory = process.env.AIVPLAYER_SMOKE_IMAGE_OUTPUT_DIRECTORY
    if (smokeImageOutputDirectory && request.title === getAppCopy(getCurrentLocale()).imageWorkspace.chooseOutputFolder) return smokeImageOutputDirectory
    return promptForDirectory(request)
  })
  ipcMain.handle(IPC_CHANNELS.LIST_MEDIA_FILES_IN_DIRECTORY, (_event, directoryPath: string) => listMediaFilesInDirectory(directoryPath))
  ipcMain.handle(IPC_CHANNELS.CREATE_MEDIA_FILE, (_event, filePath: string) => createMediaFile(filePath))
  ipcMain.handle(IPC_CHANNELS.CHECK_MEDIA_FILE, (_event, filePath: string) => isMediaFileAvailable(filePath))
  ipcMain.handle(IPC_CHANNELS.READ_FILE_CONTENT, (_event, filePath: string): Promise<string> => readFile(filePath, 'utf-8'))
  ipcMain.handle(IPC_CHANNELS.IMAGE_SAVE, async (_event, request: ImageSaveRequest): Promise<ImageSaveResult> => {
    const safeExtension = sanitizeImageExtension(request.extension)
    const safeName = sanitizeImageFileName(request.fileName, safeExtension)
    const imageCopy = getAppCopy(getCurrentLocale()).imageWorkspace
    let savePath: string | null = null
    if (request.overwriteOriginal) {
      if (!request.originalPath) return { success: false, message: imageCopy.formatMismatch }
      savePath = request.originalPath
    } else if (request.outputDirectoryPath) {
      savePath = await findAvailableImagePath(request.outputDirectoryPath, safeName)
    } else {
      savePath = await promptForSavePath({ title: imageCopy.export, defaultPath: safeName, buttonLabel: imageCopy.export, filters: [{ name: '图片文件', extensions: [safeExtension] }] })
    }
    if (!savePath) return { success: false, canceled: true, message: '' }
    const separator = request.dataUrl.indexOf(',')
    if (separator < 0) return { success: false, message: imageCopy.export }
    await writeFile(savePath, Buffer.from(request.dataUrl.slice(separator + 1), 'base64'))
    return { success: true, filePath: savePath, message: imageCopy.exportReady }
  })
  ipcMain.handle(IPC_CHANNELS.GET_MEDIA_METADATA, (_event, filePath: string): Promise<MediaProbeMetadata | null> => createMediaProbeMetadata(filePath, { resourcePath: resolveResourcePath(), env: process.env }))
  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_MEDIA_FILES, () => getInitialMediaFiles())
  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => app.getVersion())
  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, async () => { await loadAppSettings(); return desktopState.currentAppSettings })
  ipcMain.handle(IPC_CHANNELS.APP_SET_SETTINGS, (_event, settings) => saveAppSettings(settings))
  ipcMain.handle(IPC_CHANNELS.NATIVE_PLAYER_STATUS, () => getNativePlayerStatus(getCurrentLocale))
  ipcMain.handle(IPC_CHANNELS.STOP_NATIVE_PLAYER, () => stopNativePlayer(getCurrentLocale))
}
