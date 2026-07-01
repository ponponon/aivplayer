import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, shell } from 'electron'
import { existsSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { readAppSettings, writeAppSettings } from './app-settings'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  AsrModelSourceId,
  AsrRuntimeSetupResult,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleRequest,
  ClipboardWriteTextRequest,
  ClipboardWriteTextResult,
  MediaFile
} from '../shared/media-types'
import { createWhisperCppRuntime } from './ai/whisper-cpp-runtime'
import { openPathInDefaultApp } from './system/file-actions'
import { createMediaFile, registerMediaProtocolHandler, registerMediaProtocolScheme } from './media/media-protocol'
import { getNativePlayerStatus, stopNativePlayer } from './media/native-player'

registerMediaProtocolScheme()
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

function getAsrRuntime(): ReturnType<typeof createWhisperCppRuntime> {
  if (!asrRuntime) {
    asrRuntime = createWhisperCppRuntime({
      userDataPath: app.getPath('userData'),
      resourcePath: resolveResourcePath()
    })
  }

  return asrRuntime
}

function registerIpc(): void {
  ipcMain.handle(IPC_CHANNELS.OPEN_MEDIA_FILES, async () => {
    const options: Electron.OpenDialogOptions = {
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

    return result.filePaths.map(createMediaFile)
  })

  ipcMain.handle(IPC_CHANNELS.CREATE_MEDIA_FILE, (_event, filePath: string) => createMediaFile(filePath))

  ipcMain.handle(IPC_CHANNELS.GET_INITIAL_MEDIA_FILES, () => getInitialMediaFiles())

  ipcMain.handle(IPC_CHANNELS.GET_APP_VERSION, () => app.getVersion())

  ipcMain.handle(IPC_CHANNELS.APP_GET_SETTINGS, async () => {
    return readAppSettings(app.getPath('userData'))
  })

  ipcMain.handle(IPC_CHANNELS.APP_SET_SETTINGS, async (_event, settings) => {
    return writeAppSettings(app.getPath('userData'), settings)
  })

  ipcMain.handle(IPC_CHANNELS.NATIVE_PLAYER_STATUS, () => getNativePlayerStatus())

  ipcMain.handle(IPC_CHANNELS.STOP_NATIVE_PLAYER, () => stopNativePlayer())

  ipcMain.handle(IPC_CHANNELS.ASR_HEALTH_CHECK, async () => {
    return getAsrRuntime().healthCheck()
  })

  ipcMain.handle(IPC_CHANNELS.ASR_AUTO_DETECT_WHISPER_BINARY, async (): Promise<AsrRuntimeSetupResult> => {
    const status = await getAsrRuntime().autoConfigureWhisperBinaryPath()

    return {
      success: Boolean(status.binaryPath),
      message: status.binaryPath
        ? `已自动检测到 ASR 引擎：${status.binaryPath}`
        : '没有找到内置 ASR 引擎组件。正式安装包请重新安装 AIVPlayer；开发调试时可手动选择 whisper.cpp 可执行文件。',
      status
    }
  })

  ipcMain.handle(IPC_CHANNELS.ASR_SELECT_WHISPER_BINARY, async (): Promise<AsrRuntimeSetupResult> => {
    const options: Electron.OpenDialogOptions = {
      title: '选择 whisper.cpp 可执行文件',
      message: '请选择 whisper.cpp 编译生成的可执行文件。',
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
        message: '已取消选择 ASR 引擎。'
      }
    }

    const binaryPath = result.filePaths[0]
    const status = await getAsrRuntime().configureWhisperBinaryPath(binaryPath)
    const normalizedBinaryPath = status.binaryPath

    return {
      success: Boolean(normalizedBinaryPath),
      message: normalizedBinaryPath
        ? normalizedBinaryPath === binaryPath
          ? `已选择 ASR 引擎：${binaryPath}`
          : `已选择 ASR 引擎：${normalizedBinaryPath}（已自动切换到兼容版本）`
        : '选择的文件暂时无法作为 ASR 引擎使用。',
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

  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, (_event, request: ClipboardWriteTextRequest): ClipboardWriteTextResult => {
    const text = request.text.trim()

    if (!text) {
      return {
        success: false,
        message: '没有可复制的内容。'
      }
    }

    clipboard.writeText(request.text)

    return {
      success: true,
      message: '已复制到剪贴板。'
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
    title: 'AIVPlayer',
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

app.whenReady().then(() => {
  registerMediaProtocolHandler()
  registerIpc()
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
