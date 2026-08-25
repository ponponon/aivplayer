import { app, BrowserWindow, ipcMain } from 'electron'
import pkg from 'electron-updater'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { createInitialAppUpdateState, type AppUpdateState } from '../shared/app-update-types'

const INITIAL_UPDATE_CHECK_DELAY_MS = 60 * 1000
const UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000
const UPDATE_REMINDER_INTERVAL_MS = 24 * 60 * 60 * 1000
const UPDATE_PREFERENCES_FILE_NAME = 'update-preferences.json'

type UpdateCheckSource = 'automatic' | 'manual'

type UpdatePreferences = {
  skippedVersion: string | null
  dismissedVersion: string | null
  dismissedAt: number | null
}

let updaterAvailable = false
let automaticUpdatesEnabled = false
let state = createInitialAppUpdateState()
let checkPromise: Promise<AppUpdateState> | null = null
let initialCheckTimer: NodeJS.Timeout | null = null
let updateTimer: NodeJS.Timeout | null = null
let listenersRegistered = false
let skippedUpdateVersion: string | null = null
let dismissedUpdateVersion: string | null = null
let dismissedUpdateAt: number | null = null
let currentCheckSource: UpdateCheckSource = 'manual'

const silentLogger = {
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
  debug: (): void => undefined
}

export function registerAppUpdaterIpc(): void {
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_GET_STATE, () => state)
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_CHECK, () => checkForAppUpdate('manual'))
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_DOWNLOAD, () => downloadAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_INSTALL, () => installAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_DISMISS, () => dismissAppUpdate())
  ipcMain.handle(IPC_CHANNELS.APP_UPDATE_SKIP, (_event, version: string) => skipAppUpdate(version))
}

export function startAppUpdater(isCliInvocation: boolean, autoUpdatePreference = true): void {
  updaterAvailable = app.isPackaged && !process.windowsStore && !isCliInvocation && process.env.AIVPLAYER_DISABLE_AUTO_UPDATE !== '1'
  automaticUpdatesEnabled = updaterAvailable && autoUpdatePreference
  skippedUpdateVersion = updaterAvailable ? readSkippedUpdateVersion() : null
  const dismissedReminder = updaterAvailable ? readDismissedUpdateReminder() : { version: null, dismissedAt: null }
  dismissedUpdateVersion = dismissedReminder.version
  dismissedUpdateAt = dismissedReminder.dismissedAt
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
  if (initialCheckTimer) {
    clearTimeout(initialCheckTimer)
    initialCheckTimer = null
  }
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
    if (skippedUpdateVersion === updateInfo.version || (currentCheckSource === 'automatic' && isDismissedUpdateReminderActive(updateInfo.version))) {
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
  initialCheckTimer = setTimeout(() => {
    initialCheckTimer = null
    void checkForAppUpdate('automatic')
  }, INITIAL_UPDATE_CHECK_DELAY_MS)
  initialCheckTimer.unref()
  updateTimer = setInterval(() => { void checkForAppUpdate('automatic') }, UPDATE_CHECK_INTERVAL_MS)
  updateTimer.unref()
}

export async function checkForAppUpdate(source: UpdateCheckSource = 'manual'): Promise<AppUpdateState> {
  if (!updaterAvailable) return state
  if (state.status === 'checking' || state.status === 'available' || state.status === 'downloading' || state.status === 'downloaded' || state.status === 'installing') return state
  if (checkPromise) {
    if (source === 'manual') currentCheckSource = 'manual'
    return checkPromise
  }

  currentCheckSource = source
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
  if (state.status === 'available' && state.version) {
    writeDismissedUpdateReminder(state.version, Date.now())
    setState({ status: 'idle', version: undefined, error: undefined, progress: undefined })
  }
  return state
}

function skipAppUpdate(version: string): AppUpdateState {
  const normalizedVersion = version.trim()
  if (state.status !== 'available' || !normalizedVersion || state.version !== normalizedVersion) return state
  skippedUpdateVersion = normalizedVersion
  dismissedUpdateVersion = null
  dismissedUpdateAt = null
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

function readUpdatePreferences(): UpdatePreferences {
  try {
    const value: unknown = JSON.parse(readFileSync(getUpdatePreferencesPath(), 'utf8'))
    if (!value || typeof value !== 'object') return { skippedVersion: null, dismissedVersion: null, dismissedAt: null }
    const preferences = value as Record<string, unknown>
    const skippedVersion = typeof preferences.skippedVersion === 'string' && preferences.skippedVersion.trim() ? preferences.skippedVersion : null
    const dismissedVersion = typeof preferences.dismissedVersion === 'string' && preferences.dismissedVersion.trim() ? preferences.dismissedVersion : null
    const dismissedAt = typeof preferences.dismissedAt === 'number' && Number.isFinite(preferences.dismissedAt) && preferences.dismissedAt > 0 ? preferences.dismissedAt : null
    return { skippedVersion, dismissedVersion, dismissedAt }
  } catch {
    return { skippedVersion: null, dismissedVersion: null, dismissedAt: null }
  }
}

function readSkippedUpdateVersion(): string | null {
  return readUpdatePreferences().skippedVersion
}

function readDismissedUpdateReminder(): { version: string | null; dismissedAt: number | null } {
  const preferences = readUpdatePreferences()
  return { version: preferences.dismissedVersion, dismissedAt: preferences.dismissedAt }
}

function isDismissedUpdateReminderActive(version: string): boolean {
  if (dismissedUpdateVersion !== version || dismissedUpdateAt === null) return false
  const elapsed = Date.now() - dismissedUpdateAt
  if (elapsed >= 0 && elapsed < UPDATE_REMINDER_INTERVAL_MS) return true

  dismissedUpdateVersion = null
  dismissedUpdateAt = null
  persistUpdatePreferences()
  return false
}

function writeSkippedUpdateVersion(version: string): void {
  skippedUpdateVersion = version
  persistUpdatePreferences()
}

function writeDismissedUpdateReminder(version: string, dismissedAt: number): void {
  dismissedUpdateVersion = version
  dismissedUpdateAt = dismissedAt
  persistUpdatePreferences()
}

function persistUpdatePreferences(): void {
  try {
    const preferencesPath = getUpdatePreferencesPath()
    const temporaryPath = `${preferencesPath}.tmp`
    mkdirSync(app.getPath('userData'), { recursive: true })
    writeFileSync(temporaryPath, `${JSON.stringify({ skippedVersion: skippedUpdateVersion, dismissedVersion: dismissedUpdateVersion, dismissedAt: dismissedUpdateAt })}\n`, 'utf8')
    renameSync(temporaryPath, preferencesPath)
  } catch (error) {
    console.warn('[app-updater] 保存更新偏好失败', error)
  }
}
