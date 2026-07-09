import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { dirname, extname, join, resolve } from 'node:path'
import { readAppSettings, writeAppSettings } from './app-settings'
import { APP_NAME, createApplicationMenuTemplate } from './app-menu'
import { createDefaultAppSettings } from '../shared/app-settings'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AsrModelSourceId,
  AsrRuntimeSetupResult,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleTranslationRequest,
  AsrSubtitleTranslationResult,
  AsrSubtitleRequest,
  ClipboardWriteTextRequest,
  ClipboardWriteTextResult,
  MediaClipExportRequest,
  MediaClipExportResult,
  MediaProbeMetadata,
  MediaFile
} from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import type { AppLocale } from '../shared/localization'
import { createWhisperCppRuntime, resolveFfmpegPath } from './ai/whisper-cpp-runtime'
import { buildClipExportDefaultVideoPath, runClipExport } from './media/clip-export'
import { createMediaProbeMetadata } from './media/media-metadata'
import { openPathInDefaultApp } from './system/file-actions'
import { createMediaFile, registerMediaProtocolHandler, registerMediaProtocolScheme } from './media/media-protocol'
import { getNativePlayerStatus, stopNativePlayer } from './media/native-player'

registerMediaProtocolScheme()
app.setName(APP_NAME)
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

const VIDEO_EXTENSIONS = [
  'mp4',
  'm4v',
  'mov',
  'webm',
  'mkv',
  'avi',
  'flv',
  'wmv',
  'ts',
  'm2ts',
  'mpg',
  'mpeg'
]

let mainWindow: BrowserWindow | null = null
let asrRuntime: ReturnType<typeof createWhisperCppRuntime> | null = null
let initialMediaFiles: MediaFile[] | null = null
let currentAppSettings = createDefaultAppSettings()

function resolveAppIconPath(): string | null {
  const iconPath = process.env.ELECTRON_RENDERER_URL
    ? resolve(process.cwd(), 'brand/icon.png')
    : join(process.resourcesPath, 'app-icon.png')

  return existsSync(iconPath) ? iconPath : null
}

function applyMacDockIcon(): void {
  if (process.platform !== 'darwin') {
    return
  }

  const iconPath = resolveAppIconPath()
  if (!iconPath) {
    return
  }

  app.dock?.setIcon(nativeImage.createFromPath(iconPath))
}

function installApplicationMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(createApplicationMenuTemplate(process.platform)))
}

function getInitialMediaFiles(): MediaFile[] {
  if (initialMediaFiles) {
    return initialMediaFiles
  }

  initialMediaFiles = process.argv
    .slice(1)
    .filter((value) => !value.startsWith('-'))
    .map((value) => resolve(value))
    .filter((filePath) => existsSync(filePath))
    .filter((filePath) => VIDEO_EXTENSIONS.includes(extname(filePath).replace('.', '').toLowerCase()))
    .map(createMediaFile)

  return initialMediaFiles
}

function resolveResourcePath(): string {
  if (process.env.ELECTRON_RENDERER_URL) {
    return resolve('resources')
  }

  return process.resourcesPath
}

function getCurrentLocale(): AppLocale {
  return currentAppSettings.ui.locale
}

function getAsrRuntime(): ReturnType<typeof createWhisperCppRuntime> {
  if (!asrRuntime) {
    asrRuntime = createWhisperCppRuntime({
      userDataPath: app.getPath('userData'),
      resourcePath: resolveResourcePath(),
      getLocale: getCurrentLocale,
      getTranslationServiceSettings: () => ({
        translationBaseUrl: currentAppSettings.asr.translationBaseUrl,
        translationModel: currentAppSettings.asr.translationModel,
        translationApiKey: currentAppSettings.asr.translationApiKey
      })
    })
  }

  return asrRuntime
}

async function listMediaFilesInDirectory(directoryPath: string): Promise<MediaFile[]> {
  if (!directoryPath || !existsSync(directoryPath)) {
    return []
  }

  const entries = await readdir(directoryPath, { withFileTypes: true })
  const mediaPaths = entries
    .filter((entry) => entry.isFile())
    .map((entry) => join(directoryPath, entry.name))
    .filter((filePath) => VIDEO_EXTENSIONS.includes(extname(filePath).replace('.', '').toLowerCase()))

  return Promise.all(mediaPaths.map((filePath) => createMediaFile(filePath)))
}

async function expandMediaFiles(files: MediaFile[]): Promise<MediaFile[]> {
  if (files.length !== 1 || !currentAppSettings.media.autoLoadSameDirectoryFiles) {
    return files
  }

  const selectedFile = files[0]
  const directoryPath = dirname(selectedFile.path)
  const siblingFiles = await listMediaFilesInDirectory(directoryPath)
  const uniqueFiles = new Map<string, MediaFile>()

  for (const file of [...siblingFiles, ...files]) {
    uniqueFiles.set(file.path, file)
  }

  return Array.from(uniqueFiles.values())
}

async function promptForDirectory(options: {
  title: string
  defaultPath?: string | null
}): Promise<string | null> {
  const dialogOptions: Electron.OpenDialogOptions = {
    title: options.title,
    defaultPath: options.defaultPath ?? undefined,
    properties: ['openDirectory', 'createDirectory']
  }

  const result = mainWindow ? await dialog.showOpenDialog(mainWindow, dialogOptions) : await dialog.showOpenDialog(dialogOptions)

  if (result.canceled || result.filePaths.length === 0) {
    return null
  }

  return result.filePaths[0]
}

async function promptForSavePath(options: {
  title: string
  defaultPath?: string | null
  buttonLabel?: string
  filters?: Electron.FileFilter[]
}): Promise<string | null> {
  const dialogOptions: Electron.SaveDialogOptions = {
    title: options.title,
    defaultPath: options.defaultPath ?? undefined,
    buttonLabel: options.buttonLabel,
    filters: options.filters
  }

  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, dialogOptions) : await dialog.showSaveDialog(dialogOptions)

  if (result.canceled || !result.filePath) {
    return null
  }

  return result.filePath
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_FILES, async () => {
    const copy = getAppCopy(getCurrentLocale())
    const options: Electron.OpenDialogOptions = {
      defaultPath: currentAppSettings.media.defaultOpenDirectoryPath ?? undefined,
      title: copy.topbar.openFiles,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video files', extensions: VIDEO_EXTENSIONS },
        { name: 'All files', extensions: ['*'] }
      ]
    }

    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled) {
      return []
    }

    const files = await Promise.all(result.filePaths.map((filePath) => createMediaFile(filePath)))
    const expandedFiles = await expandMediaFiles(files)
    return expandedFiles
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_DIRECTORY, async () => {
    const copy = getAppCopy(getCurrentLocale())
    return promptForDirectory({
      title: copy.settingsDialog.general.selectFolderDialogTitle,
      defaultPath: currentAppSettings.media.defaultOpenDirectoryPath
    })
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_FOLDER_PICKER, async (_event, request: { title: string; defaultPath?: string | null }) => {
    return promptForDirectory(request)
  })

  ipcMain.handle(IPC_CHANNELS.LIST_MEDIA_FILES_IN_DIRECTORY, async (_event, directoryPath: string) => {
    return listMediaFilesInDirectory(directoryPath)
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_MEDIA_FILE, (_event, filePath: string) => createMediaFile(filePath))

  ipcMain.handle(IPC_CHANNELS.READ_FILE_CONTENT, async (_event, filePath: string): Promise<string> => {
    const { readFile } = await import('node:fs/promises')
    return readFile(filePath, 'utf-8')
  })

  ipcMain.handle(IPC_CHANNELS.GET_MEDIA_METADATA, async (_event, filePath: string): Promise<MediaProbeMetadata | null> => {
    return createMediaProbeMetadata(filePath, {
      resourcePath: resolveResourcePath(),
      env: process.env
    })
  })

  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_MEDIA_FILES, () => getInitialMediaFiles())

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, async () => {
    currentAppSettings = await readAppSettings(app.getPath('userData'), app.getPath('videos'))
    return currentAppSettings
  })

  ipcMain.handle(IPC_CHANNELS.APP_SET_SETTINGS, async (_event, settings) => {
    currentAppSettings = await writeAppSettings(app.getPath('userData'), settings, app.getPath('videos'))
    return currentAppSettings
  })

  ipcMain.handle(IPC_CHANNELS.NATIVE_PLAYER_STATUS, () => getNativePlayerStatus(getCurrentLocale))

  ipcMain.handle(IPC_CHANNELS.STOP_NATIVE_PLAYER, () => stopNativePlayer(getCurrentLocale))

  ipcMain.handle(IPC_CHANNELS.ASR_HEALTH_CHECK, async () => {
    return getAsrRuntime().healthCheck()
  })

  ipcMain.handle(IPC_CHANNELS.ASR_AUTO_DETECT_WHISPER_BINARY, async (): Promise<AsrRuntimeSetupResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const status = await getAsrRuntime().autoConfigureWhisperBinaryPath()

    return {
      success: Boolean(status.binaryPath),
      message: status.binaryPath ? copy.runtimeDialog.autoDetectSuccess(status.binaryPath) : copy.runtimeDialog.autoDetectMessage,
      status
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_SELECT_WHISPER_BINARY, async (): Promise<AsrRuntimeSetupResult> => {
    const copy = getAppCopy(getCurrentLocale())
    const options: Electron.OpenDialogOptions = {
      title: copy.runtimeDialog.selectWhisperTitle,
      message: copy.runtimeDialog.selectWhisperMessage,
      properties: ['openFile'],
      filters: [
        { name: 'whisper.cpp binary', extensions: process.platform === 'win32' ? ['exe'] : ['*'] },
        { name: 'All files', extensions: ['*'] }
      ]
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || result.filePaths.length === 0) {
      return {
        success: false,
        canceled: true,
        message: copy.runtimeDialog.selectWhisperCancel
      }
    }

    const binaryPath = result.filePaths[0]
    const status = await getAsrRuntime().configureWhisperBinaryPath(binaryPath)
    const normalizedBinaryPath = status.binaryPath

    return {
      success: Boolean(normalizedBinaryPath),
      message: normalizedBinaryPath
        ? normalizedBinaryPath === binaryPath
          ? copy.runtimeDialog.selectWhisperSuccess(binaryPath)
          : copy.runtimeDialog.selectWhisperCompatSuccess(normalizedBinaryPath)
        : copy.runtimeDialog.selectWhisperFailed,
      status
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_DOWNLOAD_MODEL, async (event, modelId?: string, sourceId?: AsrModelSourceId) => {
    return getAsrRuntime().downloadModel(modelId, sourceId, (progress) => {
      event.sender.send(IPC_CHANNELS.ASR_MODEL_DOWNLOAD_PROGRESS, progress)
    })
  })

  ipcMain.handle(IPC_CHANNELS.ASR_GENERATE_SUBTITLE, async (event, request: AsrSubtitleRequest) => {
    const result = await getAsrRuntime().generateSubtitle(request, (progress) => {
      event.sender.send(IPC_CHANNELS.ASR_JOB_PROGRESS, progress)
    })

    if (!result.subtitlePath) {
      return result
    }

    const subtitleFile = createMediaFile(result.subtitlePath)
    const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null

    return {
      ...result,
      subtitleUrl: subtitleFile.url,
      subtitleSrtUrl: subtitleSrtFile?.url
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_RESOLVE_SUBTITLE_CACHE, async (_event, request: AsrSubtitleRequest) => {
    const result = await getAsrRuntime().resolveSubtitleCache(request)

    if (!result.subtitlePath) {
      return result
    }

    const subtitleFile = createMediaFile(result.subtitlePath)
    const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null

    return {
      ...result,
      subtitleUrl: subtitleFile.url,
      subtitleSrtUrl: subtitleSrtFile?.url
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_EXPORT_SUBTITLE_SRT, async (_event, request: AsrSubtitleExportRequest) => {
    const result = await getAsrRuntime().exportSubtitleSrt(request)

    if (!result.subtitleSrtPath) {
      return result
    }

    const subtitleSrtFile = createMediaFile(result.subtitleSrtPath)

    return {
      ...result,
      subtitleSrtUrl: subtitleSrtFile.url
    } satisfies AsrSubtitleExportResult
  })

  ipcMain.handle(IPC_CHANNELS.ASR_TRANSLATE_SUBTITLE, async (_event, request: AsrSubtitleTranslationRequest) => {
    const result = await getAsrRuntime().translateSubtitle(request)

    if (!result.subtitlePath) {
      return result
    }

    const subtitleFile = createMediaFile(result.subtitlePath)
    const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null

    return {
      ...result,
      subtitleUrl: subtitleFile.url,
      subtitleSrtUrl: subtitleSrtFile?.url
    } satisfies AsrSubtitleTranslationResult
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_EXPORT_CLIP, async (_event, request: MediaClipExportRequest) => {
    const copy = getAppCopy(getCurrentLocale())
    const ffmpegPath = await resolveFfmpegPath(resolveResourcePath(), process.env, undefined)

    if (!ffmpegPath) {
      return {
        success: false,
        message: copy.runtime.ffmpegMissing,
        canceled: false
      }
    }

    const defaultVideoPath = buildClipExportDefaultVideoPath(
      request.mediaPath,
      request.startSeconds,
      request.durationSeconds,
      request.mode
    )
    const selectedVideoPath = await promptForSavePath({
      title: copy.runtimeDialog.clipExportSaveTitle,
      defaultPath: defaultVideoPath,
      buttonLabel: copy.runtimeDialog.clipExportSaveConfirm,
      filters: [{ name: 'MP4 video', extensions: ['mp4'] }]
    })

    if (!selectedVideoPath) {
      return {
        success: false,
        message: '',
        canceled: true
      } satisfies MediaClipExportResult
    }

    try {
      const result = await runClipExport({
        ffmpegPath,
        mediaPath: request.mediaPath,
        outputVideoPath: selectedVideoPath,
        startSeconds: request.startSeconds,
        durationSeconds: request.durationSeconds,
        mode: request.mode,
        subtitlePath: request.subtitlePath,
        subtitleSrtPath: request.subtitleSrtPath,
        getLocale: getCurrentLocale
      })

      const videoFile = createMediaFile(result.videoPath)
      const subtitleSrtFile = result.subtitleSrtPath ? createMediaFile(result.subtitleSrtPath) : null

      return {
        success: true,
        message:
          request.mode === 'burn-subtitle'
            ? copy.runtime.clipExportBurnedSuccess
            : request.mode === 'external-subtitle'
              ? copy.runtime.clipExportWithSubtitleSuccess
              : copy.runtime.clipExportSuccess,
        videoPath: result.videoPath,
        videoUrl: videoFile.url,
        subtitleSrtPath: subtitleSrtFile?.path,
        subtitleSrtUrl: subtitleSrtFile?.url
      }
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        canceled: false
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, (_event, request: ClipboardWriteTextRequest): ClipboardWriteTextResult => {
    const copy = getAppCopy(getCurrentLocale())
    const text = request.text.trim()

    if (!text) {
      return {
        success: false,
        message: copy.messages.noCopyContent
      }
    }

    clipboard.writeText(request.text)

    return {
      success: true,
      message: copy.messages.copied
    }
  })

  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, (_event, filePath: string): Promise<boolean> => {
    return openPathInDefaultApp(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.SHOW_ITEM_IN_FOLDER, (_event, filePath: string): boolean => {
    if (!filePath || !existsSync(filePath)) {
      return false
    }

    shell.showItemInFolder(filePath)
    return true
  })
}

function createWindow(): void {
  const iconPath = resolveAppIconPath()

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#090a0c',
    icon: iconPath ?? undefined,
    title: APP_NAME,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.webContents.once('did-finish-load', () => {
    const initialFiles = getInitialMediaFiles()
    if (initialFiles.length > 0) {
      mainWindow?.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, initialFiles)
    }
  })

  if (process.argv.includes('--devtools')) {
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

app.whenReady().then(async () => {
  currentAppSettings = await readAppSettings(app.getPath('userData'), app.getPath('videos'))
  registerMediaProtocolHandler()
  registerIpc()
  app.setAboutPanelOptions({ applicationName: APP_NAME })
  installApplicationMenu()
  applyMacDockIcon()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
