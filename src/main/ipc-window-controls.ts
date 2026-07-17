import { BrowserWindow, ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'

function getSenderWindow(event: Electron.IpcMainInvokeEvent): BrowserWindow | null {
  return BrowserWindow.fromWebContents(event.sender)
}

export function registerWindowControlsIpc(): void {
  ipcMain.handle(IPC_CHANNELS.WINDOW_MINIMIZE, (event) => {
    getSenderWindow(event)?.minimize()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_TOGGLE_MAXIMIZE, (event): boolean => {
    const window = getSenderWindow(event)
    if (!window) return false
    if (window.isMaximized()) window.unmaximize()
    else window.maximize()
    return window.isMaximized()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE, (event) => {
    getSenderWindow(event)?.close()
  })

  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_STATE, (event): boolean => {
    return getSenderWindow(event)?.isMaximized() ?? false
  })
}
