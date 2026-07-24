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
  if (!desktopState.mainWindow) return
  if (desktopState.mainWindow.isMinimized()) desktopState.mainWindow.restore()
  desktopState.mainWindow.show()
  desktopState.mainWindow.focus()
}

export async function deliverMediaPaths(filePaths: string[]): Promise<void> {
  if (!desktopState.mainWindow || desktopState.mainWindow.webContents.isLoading()) { desktopState.pendingMediaPaths.push(...filePaths); return }
  const files = await Promise.all(filePaths.map((path) => createMediaFile(path)))
  const expandedFiles = await expandMediaFiles(files)
  if (expandedFiles.length === 0) return
  desktopState.initialMediaFiles = mergeMediaFiles(desktopState.initialMediaFiles ?? [], expandedFiles)
  focusMainWindow()
  desktopState.mainWindow.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, expandedFiles)
}

export function queueIncomingMediaPaths(filePaths: readonly string[]): void {
  const validPaths = extractVideoFilePaths(filePaths)
  if (validPaths.length === 0) return
  if (!desktopState.initialMediaFiles || !desktopState.mainWindow || desktopState.mainWindow.webContents.isLoading()) desktopState.pendingMediaPaths.push(...validPaths)
  else void deliverMediaPaths(validPaths)
}

function flushPendingMediaPaths(): void {
  if (!desktopState.initialMediaFiles || desktopState.pendingMediaPaths.length === 0) return
  const paths = extractVideoFilePaths(desktopState.pendingMediaPaths)
  desktopState.pendingMediaPaths = []
  if (paths.length > 0) void deliverMediaPaths(paths)
}

export function createWindow(): void {
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
  desktopState.mainWindow.on('closed', () => { desktopState.mainWindow = null })
}
