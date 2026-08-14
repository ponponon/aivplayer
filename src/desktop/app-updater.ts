import { app, BrowserWindow, ipcMain } from 'electron'
import pkg from 'electron-updater'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { createInitialAppUpdateState, type AppUpdateState } from '../shared/app-update-types'

const { autoUpdater } = pkg
const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000

let enabled = false
let state = createInitialAppUpdateState()
let checkPromise: Promise<AppUpdateState> | null = null
let updateTimer: NodeJS.Timeout | null = null
let listenersRegistered = false

const silentLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
  debug: (): void => undefined
}

export function registerAppUpdaterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_GET_STATE, () => state)
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_CHECK, () => checkForAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_INSTALL, () => installAppUpdate())
}

export function startAppUpdater(isCliInvocation: boolean): void {
  enabled = app.isPackaged && process.platform !== 'darwin' && !process.windowsStore && !isCliInvocation && process.env.AIVPLAYER_DISABLE_AUTO_UPDATE !== '1'
  state = enabled
    ? createInitialAppUpdateState(app.getVersion())
    : { ...createInitialAppUpdateState(app.getVersion()), status: 'disabled' }
  publishState()
  if (!enabled) return

  configureAutoUpdater()
  void checkForAppUpdate()
  updateTimer = setInterval(() => { void checkForAppUpdate() }, UPDATE_CHECK_INTERVAL_MS)
  updateTimer.unref()
  app.once('will-quit', stopAppUpdater)
}

export function stopAppUpdater(): void {
  if (updateTimer) {
    clearInterval(updateTimer)
    updateTimer = null
  }
}

function configureAutoUpdater(): void {
  if (listenersRegistered) return
  listenersRegistered = true
  autoUpdater.logger = silentLogger
  autoUpdater.channel = 'latest'
  autoUpdater.allowPrerelease = false
  autoUpdater.allowDowngrade = false
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false

  autoUpdater.on('checking-for-update', () => {
    setState({ status: 'checking', error: undefined, progress: undefined })
  })
  autoUpdater.on('update-available', (updateInfo) => {
    setState({ status: 'downloading', version: updateInfo.version, error: undefined, progress: undefined })
    void autoUpdater.downloadUpdate().catch((error: unknown) => {
      setError(error)
    })
  })
  autoUpdater.on('update-not-available', () => {
    setState({ status: 'up-to-date', version: undefined, error: undefined, progress: undefined })
  })
  autoUpdater.on('download-progress', (progress) => {
    setState({
      status: 'downloading',
      progress: {
        percent: Math.min(100, Math.max(0, progress.percent)),
        transferred: progress.transferred,
        total: progress.total,
        bytesPerSecond: progress.bytesPerSecond
      }
    })
  })
  autoUpdater.on('update-downloaded', (updateInfo) => {
    setState({ status: 'downloaded', version: updateInfo.version, error: undefined, progress: undefined })
  })
  autoUpdater.on('error', (error, message) => {
    setError(message ? new Error(message) : error)
  })
}

async function checkForAppUpdate(): Promise<AppUpdateState> {
  if (!enabled) return state
  if (state.status === 'checking' || state.status === 'downloading' || state.status === 'downloaded' || state.status === 'installing') return state
  if (checkPromise) return checkPromise

  checkPromise = autoUpdater.checkForUpdates()
    .then((result) => {
      if (!result?.isUpdateAvailable && state.status === 'checking') {
        setState({ status: 'up-to-date', version: undefined, error: undefined, progress: undefined })
      }
      return state
    })
    .catch((error: unknown) => {
      setError(error)
      return state
    })
    .finally(() => {
      checkPromise = null
    })
  return checkPromise
}

function installAppUpdate(): void {
  if (!enabled) throw new Error('应用更新在当前运行模式下不可用')
  if (state.status !== 'downloaded') throw new Error('更新尚未下载完成')
  setState({ status: 'installing', version: state.version, error: undefined, progress: undefined })
  try {
    // Windows NSIS updates should behave like a restart: run the downloaded
    // installer silently, then launch the updated application.
    autoUpdater.quitAndInstall(true, true)
  } catch (error) {
    setError(error)
    throw error
  }
}

function setError(error: unknown): void {
  setState({ status: 'error', version: state.version, error: error instanceof Error ? error.message : String(error), progress: undefined })
}

function setState(next: Omit<AppUpdateState, 'currentVersion'>): void {
  state = { ...state, currentVersion: app.getVersion(), ...next }
  publishState()
}

function publishState(): void {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.APP_UPDATE_STATE_CHANGED, state)
  })
}
