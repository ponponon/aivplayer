import { BrowserWindow, app, nativeImage } from 'electron'
import { join, resolve } from 'node:path'
import { APP_NAME } from './main-settings'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { createMediaFile } from './media/media-protocol'
import { extractVideoFilePaths, isVideoFilePath, mergeMediaFiles } from './media/file-opening'
import { expandMediaFiles, getInitialMediaFiles } from './media-dialogs'
import { mainState } from './main-state'
import { resolveAppIconPath } from './main-services'

export function applyMacDockIcon(): void {
  if (process.platform === 'darwin') {
    const iconPath = resolveAppIconPath()
    if (iconPath) app.dock?.setIcon(nativeImage.createFromPath(iconPath))
  }
}

export function focusMainWindow(): void {
  if (!mainState.mainWindow) return
  if (mainState.mainWindow.isMinimized()) mainState.mainWindow.restore()
  mainState.mainWindow.show()
  mainState.mainWindow.focus()
}

export async function deliverMediaPaths(filePaths: string[]): Promise<void> {
  if (!mainState.mainWindow || mainState.mainWindow.webContents.isLoading()) { mainState.pendingMediaPaths.push(...filePaths); return }
  const files = await Promise.all(filePaths.map((path) => createMediaFile(path)))
  const expandedFiles = await expandMediaFiles(files)
  if (expandedFiles.length === 0) return
  mainState.initialMediaFiles = mergeMediaFiles(mainState.initialMediaFiles ?? [], expandedFiles)
  focusMainWindow()
  mainState.mainWindow.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, expandedFiles)
}

export function queueIncomingMediaPaths(filePaths: readonly string[]): void {
  const validPaths = extractVideoFilePaths(filePaths)
  if (validPaths.length === 0) return
  if (!mainState.initialMediaFiles || !mainState.mainWindow || mainState.mainWindow.webContents.isLoading()) mainState.pendingMediaPaths.push(...validPaths)
  else void deliverMediaPaths(validPaths)
}

function flushPendingMediaPaths(): void {
  if (!mainState.initialMediaFiles || mainState.pendingMediaPaths.length === 0) return
  const paths = extractVideoFilePaths(mainState.pendingMediaPaths)
  mainState.pendingMediaPaths = []
  if (paths.length > 0) void deliverMediaPaths(paths)
}

export function createWindow(): void {
  const iconPath = resolveAppIconPath()
  const isMac = process.platform === 'darwin'
  mainState.mainWindow = new BrowserWindow({
    width: 1360,
    height: 840,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#090a0c',
    icon: iconPath ?? undefined,
    title: APP_NAME,
    ...(isMac
      ? { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 16, y: 16 } }
      : { titleBarStyle: 'hidden', titleBarOverlay: true }
    ),
    webPreferences: { preload: join(__dirname, '../preload/index.js'), contextIsolation: true, nodeIntegration: false, sandbox: false }
  })
  
  // Linux/Windows: 窗口准备好后更新原生窗口控件颜色
  if (!isMac && mainState.mainWindow) {
    const updateColors = () => {
      mainState.mainWindow?.setTitleBarOverlay({
        color: '#090a0c',
        symbolColor: '#e8c16d',
        height: 40
      })
    }
    mainState.mainWindow.once('ready-to-show', updateColors)
    mainState.mainWindow.on('focus', updateColors)
  }
  if (process.env.ELECTRON_RENDERER_URL) mainState.mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  else mainState.mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  mainState.mainWindow.webContents.once('did-finish-load', () => {
    const initialFiles = getInitialMediaFiles()
    if (initialFiles.length > 0) mainState.mainWindow?.webContents.send(IPC_CHANNELS.MEDIA_FILES_OPENED, initialFiles)
    flushPendingMediaPaths()
  })
  if (process.argv.includes('--devtools')) mainState.mainWindow.webContents.openDevTools({ mode: 'detach' })
  mainState.mainWindow.on('closed', () => { mainState.mainWindow = null })
}
