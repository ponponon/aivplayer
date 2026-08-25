import { BrowserWindow, app, nativeImage } from 'electron'
import { join, resolve } from 'node:path'
import { APP_NAME } from './desktop-settings'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { createMediaFile } from './media/media-protocol'
import { extractVideoFilePaths, isVideoFilePath, mergeMediaFiles } from '../core/media/file-opening'
import { expandMediaFiles, getInitialMediaFiles } from './media-dialogs'
import { desktopState } from './desktop-state'
import { resolveAppIconPath } from './desktop-services'

const DEFAULT_WINDOW_ZOOM_FACTOR = 3

export function applyMacDockIcon(): void {
  if (process.platform === 'darwin') {
    const iconPath = resolveAppIconPath()
    if (iconPath) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  }
}

export function focusMainWindow(): void {
  const window = getLiveMainWindow()
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
}

export function ensureMainWindow(): void {
  if (getLiveMainWindow()) {
    focusMainWindow()
    return
  }

  // open-file can arrive before ready during a cold start. The normal
  // whenReady startup path will create the window after pending paths are
  // queued, while this branch handles a window closed during app lifetime.
  if (!app.isReady()) return
  createWindow()
  focusMainWindow()
}

function getLiveMainWindow(): BrowserWindow | null {
  const window = desktopState.mainWindow
  return window && !window.isDestroyed() ? window : null
}

export async function deliverMediaPaths(filePaths: string[], allowLoading = false): Promise<void> {
  const loadingWindow = getLiveMainWindow()
  if (!loadingWindow || (!allowLoading && loadingWindow.webContents.isLoading())) { desktopState.pendingMediaPaths.push(...filePaths); return }
  const files = await Promise.all(filePaths.map((path) => createMediaFile(path)))
  const expandedFiles = await expandMediaFiles(files)
  if (expandedFiles.length === 0) return
  const targetWindow = getLiveMainWindow()
  if (!targetWindow || (!allowLoading && targetWindow.webContents.isLoading())) { desktopState.pendingMediaPaths.push(...filePaths); return }
  desktopState.initialMediaFiles = mergeMediaFiles(desktopState.initialMediaFiles ?? [], expandedFiles)
  focusMainWindow()
  targetWindow.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, expandedFiles)
}

export function queueIncomingMediaPaths(filePaths: readonly string[]): void {
  const validPaths = extractVideoFilePaths(filePaths)
  if (validPaths.length === 0) return
  const window = getLiveMainWindow()
  if (!desktopState.initialMediaFiles || !window || window.webContents.isLoading()) desktopState.pendingMediaPaths.push(...validPaths)
  else void deliverMediaPaths(validPaths)
}

function flushPendingMediaPaths(): void {
  if (!desktopState.initialMediaFiles || desktopState.pendingMediaPaths.length === 0) return
  const paths = extractVideoFilePaths(desktopState.pendingMediaPaths)
  desktopState.pendingMediaPaths = []
  if (paths.length > 0) void deliverMediaPaths(paths, true)
}

export function createWindow(): BrowserWindow {
  const iconPath = resolveAppIconPath()
  const isMac = process.platform === 'darwin'
  const useCustomWindowControls = process.platform === 'linux' || process.platform === 'win32'
  desktopState.mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#090a0c',
    icon: iconPath ?? undefined,
    title: APP_NAME,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : useCustomWindowControls
        ? { titleBarStyle: 'hidden', frame: false }
        : { titleBarStyle: 'hidden', titleBarOverlay: true }
    ),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  
  if (useCustomWindowControls && desktopState.mainWindow) {
    const sendMaximizedState = (): void => {
      if (!desktopState.mainWindow || desktopState.mainWindow.isDestroyed()) return
      desktopState.mainWindow.webContents.send(IPC_CHANNELS.WINDOW_STATE_CHANGED, desktopState.mainWindow.isMaximized())
    }
    desktopState.mainWindow.on('maximize', sendMaximizedState)
    desktopState.mainWindow.on('unmaximize', sendMaximizedState)
    desktopState.mainWindow.on('restore', sendMaximizedState)
  }
  desktopState.mainWindow.webContents.setZoomFactor(DEFAULT_WINDOW_ZOOM_FACTOR)
  if (process.env.ELECTRON_RENDERER_URL) desktopState.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else desktopState.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  desktopState.mainWindow.webContents.once('did-finish-load', () => {
    const initialFiles = getInitialMediaFiles()
    if (initialFiles.length > 0) desktopState.mainWindow?.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, initialFiles)
    flushPendingMediaPaths()
  })
  if (process.argv.includes('--devtools')) desktopState.mainWindow.webContents.openDevTools({ mode: 'detach' })
  const createdWindow = desktopState.mainWindow
  createdWindow.on('closed', () => {
    if (desktopState.mainWindow === createdWindow) desktopState.mainWindow = null
  })
  return createdWindow
}
