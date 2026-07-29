import { app, ipcMain } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ImageSaveRequest, ImageSaveResult, MediaProbeMetadata } from '../shared/media-types'
import type { LivePhotoExportRequest, LivePhotoExportResult } from '../shared/live-photo-types'
import { getAppCopy } from '../shared/i18n'
import { createMediaProbeMetadata } from '../core/media/media-metadata'
import { createMediaFile } from './media/media-protocol'
import { getNativePlayerStatus, stopNativePlayer } from '../core/media/native-player'
import { listMediaFilesInDirectory, promptForDirectory, promptForMediaFiles, promptForSavePath, getInitialMediaFiles } from './media-dialogs'
import { isMediaFileAvailable } from '../core/media/file-opening'
import { getCurrentLocale, loadAppSettings, saveAppSettings } from './desktop-settings'
import { resolveResourcePath } from './desktop-services'
import { desktopState } from './desktop-state'
import { findAvailableImagePath, sanitizeImageExtension, sanitizeImageFileName } from '../core/image-save-utils'
import { resolveFfmpegPath, resolveFfprobePath } from '../core/ai/whisper-cpp-runtime'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm, readdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { editAndExportLivePhoto, getLivePhotoDefaultDirectory, getLivePhotoDefaultName, probeLivePhotoFile } from '../core/live-photo/live-photo-service'
import { resolveHeicCoverToolPaths } from '../core/live-photo/heic-cover'

const execFileAsync = promisify(execFile)

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
  ipcMain.handle(IPC_CHANNELS.IMAGE_CONVERT_HEIC, async (_event, filePath: string): Promise<{ success: boolean; dataUrl?: string; error?: string }> => {
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { success: false, error: 'ffmpeg not found' }
    const tempDir = await mkdtemp(join(tmpdir(), 'aivplayer-heic-'))
    try {
      const outputPath = join(tempDir, 'converted.jpg')
      await execFileAsync(ffmpegPath, ['-i', filePath, '-q:v', '2', '-y', outputPath])
      const files = await readdir(tempDir)
      const jpgFile = files.find((f) => f.endsWith('.jpg'))
      if (!jpgFile) return { success: false, error: 'Conversion failed' }
      const buffer = await readFile(join(tempDir, jpgFile))
      return { success: true, dataUrl: `data:image/jpeg;base64,${buffer.toString('base64')}` }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : String(error) }
    } finally {
      await rm(tempDir, { recursive: true, force: true }).catch(() => {})
    }
  })
  ipcMain.handle(IPC_CHANNELS.LIVE_PHOTO_PROBE, async (_event, filePath: string) => {
    const ffprobePath = await resolveFfprobePath(resolveResourcePath(), process.env, undefined)
    if (!ffprobePath) return null
    const probed = await probeLivePhotoFile({ ffprobePath, sourcePath: filePath }).catch(() => null)
    if (!probed) return null
    return { ...probed.result, motionUrl: createMediaFile(probed.motionPath).url }
  })
  ipcMain.handle(IPC_CHANNELS.LIVE_PHOTO_EXPORT, async (_event, request: LivePhotoExportRequest): Promise<LivePhotoExportResult> => {
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)
    const ffprobePath = await resolveFfprobePath(resolveResourcePath(), process.env, undefined)
    if (!ffmpegPath) return { success: false, message: '找不到 FFmpeg' }
    const defaultName = getLivePhotoDefaultName(request.sourcePath)
    const extension = defaultName.split('.').pop()?.toLowerCase() || 'jpg'
    const selectedPath = await promptForSavePath({ title: '导出 Live Photo', defaultPath: join(getLivePhotoDefaultDirectory(request.sourcePath), defaultName), buttonLabel: '导出', filters: [{ name: 'Live Photo', extensions: [extension] }] })
    if (!selectedPath) return { success: false, canceled: true, message: '' }
    try {
      return await editAndExportLivePhoto({ ffmpegPath, ffprobePath: ffprobePath ?? undefined, sourcePath: request.sourcePath, outputPath: selectedPath, edit: request.options, coverDataUrl: request.coverDataUrl, heicCoverTools: await resolveHeicCoverToolPaths(process.env, resolveResourcePath()) })
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, async () => { await loadAppSettings(); return desktopState.currentAppSettings })
  ipcMain.handle(IPC_CHANNELS.APP_SET_SETTINGS, (_event, settings) => saveAppSettings(settings))
  ipcMain.handle(IPC_CHANNELS.NATIVE_PLAYER_STATUS, () => getNativePlayerStatus(getCurrentLocale))
  ipcMain.handle(IPC_CHANNELS.STOP_NATIVE_PLAYER, () => stopNativePlayer(getCurrentLocale))
}
