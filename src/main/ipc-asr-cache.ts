import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import { getAsrRuntime } from './main-services'

export function registerAsrCacheIpc(): void {
  ipcMain.handle(IPC_CHANNELS.ASR_CACHE_STATS, () => getAsrRuntime().getAsrCacheStats())
  ipcMain.handle(IPC_CHANNELS.ASR_CACHE_CLEAR_STALE, () => getAsrRuntime().clearStaleAsrCache())
}
