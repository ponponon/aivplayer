import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { existsSync } from 'node:fs'
import { join, extname, resolve } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { AsrModelSourceId, AsrSubtitleRequest, MediaFile } from '../shared/media-types'
import { createWhisperCppRuntime } from './ai/whisper-cpp-runtime'
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

function getAsrRuntime(): ReturnType<typeof createWhisperCppRuntime> {
  if (!asrRuntime) {
    asrRuntime = createWhisperCppRuntime({
      userDataPath: app.getPath('userData'),
      resourcePath: process.resourcesPath
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

  ipcMain.handle(IPC_CHANNELS.NATIVE_PLAYER_STATUS, () => getNativePlayerStatus())

  ipcMain.handle(IPC_CHANNELS.STOP_NATIVE_PLAYER, () => stopNativePlayer())

  ipcMain.handle(IPC_CHANNELS.ASR_HEALTH_CHECK, async () => {
    return getAsrRuntime().healthCheck()
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

    return {
      ...result,
      subtitleUrl: subtitleFile.url
    }
  })
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#090a0c',
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
