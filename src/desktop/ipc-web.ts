import { app, BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { WebDesktopStateUpdate, WebShareStartRequest, WebShareStatus } from '../shared/web-types'
import { resolveFfmpegPath } from '../core/ai/whisper-cpp-runtime'
import { resolveResourcePath } from './desktop-services'
import { join } from 'node:path'
import { WebServer } from './web/web-server'

let webServer: WebServer | null = null

function getWebServer(): WebServer {
  if (!webServer) {
    webServer = new WebServer({
      resourcePath: resolveResourcePath(),
      cacheRoot: join(app.getPath('userData'), 'web-transcode'),
      getFfmpegPath: () => resolveFfmpegPath(resolveResourcePath(), process.env, undefined),
      onRemoteCommand: (command) => {
        const window = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed())
        window?.webContents.send(IPC_CHANNELS.WEB_REMOTE_COMMAND, command)
      }
    })
  }
  return webServer
}

export function registerWebIpc(): void {
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_START, async (_event, request: WebShareStartRequest): Promise<WebShareStatus> => {
    if (!request || !Array.isArray(request.filePaths)) throw new Error('共享文件列表无效')
    if (request.directoryPaths !== undefined && !Array.isArray(request.directoryPaths)) throw new Error('共享目录列表无效')
    return getWebServer().start({ filePaths: request.filePaths, directoryPaths: request.directoryPaths, allowRemoteControl: request.allowRemoteControl })
  })
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_STOP, async (): Promise<WebShareStatus> => {
    if (!webServer) return { running: false, port: null, urls: [], sharedFileCount: 0, sharedDirectoryCount: 0, sharedDirectoryPaths: [], allowRemoteControl: false }
    await webServer.stop()
    return webServer.getStatus()
  })
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_STATUS, (): WebShareStatus => webServer?.getStatus() ?? { running: false, port: null, urls: [], sharedFileCount: 0, sharedDirectoryCount: 0, sharedDirectoryPaths: [], allowRemoteControl: false })
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_REFRESH, async (_event, request: WebShareStartRequest): Promise<WebShareStatus> => {
    if (!request || !Array.isArray(request.filePaths)) throw new Error('共享文件列表无效')
    if (request.directoryPaths !== undefined && !Array.isArray(request.directoryPaths)) throw new Error('共享目录列表无效')
    return getWebServer().refresh({ filePaths: request.filePaths, directoryPaths: request.directoryPaths, allowRemoteControl: request.allowRemoteControl })
  })
  ipcMain.handle(IPC_CHANNELS.WEB_DESKTOP_STATE_UPDATE, (_event, state: WebDesktopStateUpdate): void => {
    if (!state || !Array.isArray(state.playlistFilePaths)) return
    getWebServer().updateDesktopState(state)
  })
}

export async function stopWebServer(): Promise<void> {
  if (!webServer) return
  await webServer.stop()
}
