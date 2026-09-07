import { app, ipcMain } from 'electron'
import { join, resolve } from 'node:path'
import { clearStaleMediaCaches, createMediaCacheRoots, getMediaCacheStats } from '../core/media/media-cache-management'
import { IPC_CHANNELS } from '../shared/ipc-channels'

function getMediaCacheRoots() {
  const asrCacheDirectory = process.env.AIVPLAYER_ASR_CACHE_DIR
    ? resolve(process.env.AIVPLAYER_ASR_CACHE_DIR)
    : join(app.getPath('userData'), 'asr-cache')
  return createMediaCacheRoots(app.getPath('userData'), asrCacheDirectory)
}

export function registerMediaCacheIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_CACHE_STATS, () => getMediaCacheStats(getMediaCacheRoots()))
  ipcMain.handle(IPC_CHANNELS.MEDIA_CACHE_CLEAR_STALE, () => clearStaleMediaCaches(getMediaCacheRoots()))
}
