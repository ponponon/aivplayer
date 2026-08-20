import { app, BrowserWindow, ipcMain } from 'electron'
import pkg from 'electron-updater'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { createInitialAppUpdateState, type AppUpdateState } from '../shared/app-update-types'

const UPDATE_CHECK_INTERVAL_MS = 10 * 60 * 1000
const UPDATE_PREFERENCES_FILE_NAME = 'update-preferences.json'

let updaterAvailable = false
let automaticUpdatesEnabled = false
let state = createInitialAppUpdateState()
let checkPromise: Promise<AppUpdateState> | null = null
let updateTimer: NodeJS.Timeout | null = null
let listenersRegistered = false
let skippedUpdateVersion: string | null = null

const silentLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
  debug: (): void => undefined
}

export function registerAppUpdaterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_GET_STATE, () => state)
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_CHECK, () => checkForAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_DOWNLOAD, () => downloadAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_INSTALL, () => installAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_DISMISS, () => dismissAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_SKIP, (_event, version: string) => skipAppUpdate(version))
}

export function startAppUpdater(isCliInvocation: boolean, autoUpdatePreference = true): void {
  updaterAvailable = app.isPackaged && !process.windowsStore && !isCliInvocation && process.env.AIVPLAYER_DISABLE_AUTO_UPDATE !== '1'
  automaticUpdatesEnabled = updaterAvailable && autoUpdatePreference
  skippedUpdateVersion = updaterAvailable ? readSkippedUpdateVersion() : null
  state = updaterAvailable
    ? createInitialAppUpdateState(app.getVersion())
    : { ...createInitialAppUpdateState(app.getVersion()), status: 'disabled' }
  publishState()
  if (!updaterAvailable) return

  configureAutoUpdater()
  if (automaticUpdatesEnabled) startAutomaticUpdateChecks()
  app.once('will-quit', stopAppUpdater)
}

export function updateAppUpdaterPreference(autoUpdatePreference: boolean): void {
  automaticUpdatesEnabled = updaterAvailable && autoUpdatePreference
  if (!updaterAvailable) return

  if (automaticUpdatesEnabled) {
    startAutomaticUpdateChecks()
  } else {
    stopAppUpdater()
  }
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
  const autoUpdater = pkg.autoUpdater
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
    if (skippedUpdateVersion === updateInfo.version) {
      setState({ status: 'idle', version: undefined, error: undefined, progress: undefined })
      return
    }
    setState({ status: 'available', version: updateInfo.version, error: undefined, progress: undefined })
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

function startAutomaticUpdateChecks(): void {
  if (!updaterAvailable || !automaticUpdatesEnabled || updateTimer) return
  void checkForAppUpdate()
  updateTimer = setInterval(() => { void checkForAppUpdate() }, UPDATE_CHECK_INTERVAL_MS)
  updateTimer.unref()
}

export async function checkForAppUpdate(): Promise<AppUpdateState> {
  if (!updaterAvailable) return state
  if (state.status === 'checking' || state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded' || state.status === 'installing') return state
  if (checkPromise) return checkPromise

  checkPromise = pkg.autoUpdater.checkForUpdates()
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

async function downloadAppUpdate(): Promise<AppUpdateState> {
  if (!updaterAvailable) throw new Error('应用更新在当前运行模式下不可用')
  if (state.status === 'downloading' || state.status === 'downloaded') return state
  if (state.status !== 'available') throw new Error('当前没有可下载的更新')

  setState({ status: 'downloading', version: state.version, error: undefined, progress: undefined })
  try {
    await pkg.autoUpdater.downloadUpdate()
    return state
  } catch (error) {
    setError(error)
    throw error
  }
}

function installAppUpdate(): void {
  if (!updaterAvailable) throw new Error('应用更新在当前运行模式下不可用')
  if (state.status !== 'downloaded') throw new Error('更新尚未下载完成')
  setState({ status: 'installing', version: state.version, error: undefined, progress: undefined })
  try {
    // Windows NSIS updates should behave like a restart: run the downloaded
    // installer silently, then launch the updated application.
    pkg.autoUpdater.quitAndInstall(true, true)
  } catch (error) {
    setError(error)
    throw error
  }
}

function dismissAppUpdate(): AppUpdateState {
  if (state.status === 'available') {
    setState({ status: 'idle', version: undefined, error: undefined, progress: undefined })
  }
  return state
}

function skipAppUpdate(version: string): AppUpdateState {
  const normalizedVersion = version.trim()
  if (state.status !== 'available' || !normalizedVersion || state.version !== normalizedVersion) return state
  skippedUpdateVersion = normalizedVersion
  writeSkippedUpdateVersion(normalizedVersion)
  setState({ status: 'idle', version: undefined, error: undefined, progress: undefined })
  return state
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

function getUpdatePreferencesPath(): string {
  return join(app.getPath('userData'), UPDATE_PREFERENCES_FILE_NAME)
}

function readSkippedUpdateVersion(): string | null {
  try {
    const value: unknown = JSON.parse(readFileSync(getUpdatePreferencesPath(), 'utf8'))
    if (!value || typeof value !== 'object' || !('skippedVersion' in value)) return null
    const skippedVersion = value.skippedVersion
    return typeof skippedVersion === 'string' && skippedVersion.trim() ? skippedVersion : null
  } catch {
    return null
  }
}

function writeSkippedUpdateVersion(version: string): void {
  try {
    const preferencesPath = getUpdatePreferencesPath()
    const temporaryPath = `${preferencesPath}.tmp`
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(temporaryPath, `${JSON.stringify({ skippedVersion: version })}\n`, 'utf8')
    renameSync(temporaryPath, preferencesPath)
  } catch (error) {
    console.warn('[app-updater] 保存跳过版本失败', error)
  }
}
