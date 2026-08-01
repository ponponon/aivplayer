import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { WebShareStartRequest, WebShareStatus } from '../shared/web-types'
import { resolveResourcePath } from './desktop-services'
import { WebServer } from './web/web-server'

let webServer: WebServer | null = null

function getWebServer(): WebServer {
  if (!webServer) webServer = new WebServer({ resourcePath: resolveResourcePath() })
  return webServer
}

export function registerWebIpc(): void {
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_START, async (_event, request: WebShareStartRequest): Promise<WebShareStatus> => {
    if (!request || !Array.isArray(request.filePaths)) throw new Error('共享文件列表无效')
    return getWebServer().start({ filePaths: request.filePaths })
  })
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_STOP, async (): Promise<WebShareStatus> => {
    if (!webServer) return { running: false, port: null, urls: [], sharedFileCount: 0 }
    await webServer.stop()
    return webServer.getStatus()
  })
  ipcMain.handle(IPC_CHANNELS.WEB_SHARE_STATUS, (): WebShareStatus => webServer?.getStatus() ?? { running: false, port: null, urls: [], sharedFileCount: 0 })
}

export async function stopWebServer(): Promise<void> {
  if (!webServer) return
  await webServer.stop()
}
