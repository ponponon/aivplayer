import { app, clipboard, ipcMain, shell } from 'electron'
import { existsSync } from 'node:fs'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { ClipboardWriteTextRequest, ClipboardWriteTextResult } from '../shared/media-types'
import { getAppCopy } from '../shared/i18n'
import { getCurrentLocale } from './desktop-settings'
import { openPathInDefaultApp } from './system/file-actions'

export function registerUtilityIpc(): void {
  ipcMain.handle(IPC_CHANNELS.CLIPBOARD_WRITE_TEXT, (_event, request: ClipboardWriteTextRequest): ClipboardWriteTextResult => {
    const copy = getAppCopy(getCurrentLocale())
    if (!request.text.trim()) return { success: false, message: copy.messages.noCopyContent }
    clipboard.writeText(request.text)
    return { success: true, message: copy.messages.copied }
  })
  ipcMain.handle(IPC_CHANNELS.OPEN_PATH, (_event, filePath: string): Promise<boolean> => openPathInDefaultApp(filePath))
  ipcMain.handle(IPC_CHANNELS.SHOW_ITEM_IN_FOLDER, (_event, filePath: string): boolean => {
    if (!filePath || !existsSync(filePath)) return false
    shell.showItemInFolder(filePath)
    return true
  })
}
