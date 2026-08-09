import type { IpcMainInvokeEvent, WebContents } from 'electron'
import { ipcMain } from 'electron'
import { MEDIA_IMPORT_INBOX_MAX_BATCH_ITEMS } from '../core/media/media-import-inbox'
import { createMediaImportInboxWatcher, type MediaImportInboxWatcher } from '../core/media/media-import-inbox-watcher'
import { isMediaImportInboxScanAbortError, scanMediaImportInbox } from '../core/media/media-import-inbox-scan'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type {
  MediaImportInboxDirectoriesChangedEvent,
  MediaImportInboxBatchTransitionRequest,
  MediaImportInboxMetadataUpdateRequest,
  MediaImportInboxScanProgress,
  MediaImportInboxScanRequest,
  MediaImportInboxScanResponse,
  MediaImportInboxStatus,
  MediaImportInboxTransitionRequest,
  MediaImportInboxWatchRequest,
  MediaImportInboxWatchStartResult
} from '../shared/media-import-inbox'
import { getMediaImportInboxProcessor, getMediaImportInboxStore } from './desktop-services'
import { desktopState } from './desktop-state'

type WatchState = {
  sender: WebContents
  watcher: MediaImportInboxWatcher
  onDestroyed: () => void
}

const scanControllers = new Map<number, AbortController>()
const watchStates = new Map<number, WatchState>()

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function asScanRequest(value: unknown): MediaImportInboxScanRequest {
  if (!value || typeof value !== 'object') return { directories: [], recursive: true }
  const request = value as Partial<MediaImportInboxScanRequest>
  return { directories: asStringArray(request.directories), recursive: request.recursive !== false }
}

function asWatchRequest(value: unknown): MediaImportInboxWatchRequest {
  const request = asScanRequest(value)
  return request
}

function isInboxStatus(value: unknown): value is Exclude<MediaImportInboxStatus, 'missing'> {
  return value === 'discovered' || value === 'queued' || value === 'ignored' || value === 'failed'
}

function asTransitionRequest(value: unknown): MediaImportInboxTransitionRequest | null {
  if (!value || typeof value !== 'object') return null
  const request = value as Partial<MediaImportInboxTransitionRequest>
  if (typeof request.itemId !== 'string' || !request.itemId.trim() || !isInboxStatus(request.status)) return null
  return {
    itemId: request.itemId.trim(),
    status: request.status,
    ...(typeof request.error === 'string' ? { error: request.error } : {})
  }
}

function asBatchTransitionRequest(value: unknown): MediaImportInboxBatchTransitionRequest | null {
  if (!value || typeof value !== 'object') return null
  const request = value as Partial<MediaImportInboxBatchTransitionRequest>
  const itemIds = asStringArray(request.itemIds).map((itemId) => itemId.trim()).filter(Boolean)
  if (itemIds.length === 0 || itemIds.length > MEDIA_IMPORT_INBOX_MAX_BATCH_ITEMS || (new Set(itemIds)).size !== itemIds.length) return null
  if (request.action !== 'queue' && request.action !== 'ignore' && request.action !== 'retry' && request.action !== 'clear') return null
  return { itemIds, action: request.action }
}

function asMetadataUpdateRequest(value: unknown): MediaImportInboxMetadataUpdateRequest | null {
  if (!value || typeof value !== 'object') return null
  const request = value as Partial<MediaImportInboxMetadataUpdateRequest>
  if (typeof request.itemId !== 'string' || !request.itemId.trim() || !request.patch || typeof request.patch !== 'object' || Array.isArray(request.patch)) return null
  return { itemId: request.itemId.trim(), patch: request.patch, writeSidecar: request.writeSidecar !== false }
}

function sendProgress(sender: WebContents, progress: MediaImportInboxScanProgress): void {
  if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_PROGRESS, progress)
}

function stopWatcherForSender(sender: WebContents): void {
  const state = watchStates.get(sender.id)
  if (!state) return
  state.watcher.stop()
  sender.removeListener('destroyed', state.onDestroyed)
  watchStates.delete(sender.id)
}

export function registerMediaImportInboxIpc(): void {
  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_LIST, () => getMediaImportInboxStore().listItems())

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_START, async (event: IpcMainInvokeEvent, value: unknown): Promise<MediaImportInboxScanResponse> => {
    const request = asScanRequest(value)
    const senderId = event.sender.id
    scanControllers.get(senderId)?.abort()
    const controller = new AbortController()
    scanControllers.set(senderId, controller)
    try {
      const result = await scanMediaImportInbox({
        directories: request.directories,
        recursive: request.recursive,
        signal: controller.signal,
        onProgress: (progress) => sendProgress(event.sender, progress)
      })
      const store = getMediaImportInboxStore()
      store.reconcile(result.files, result.scannedDirectories)
      await store.refreshSidecars(result.files.map((file) => file.path))
      await store.persist()
      const items = store.listItems()
      sendProgress(event.sender, {
        status: 'completed',
        directoriesScanned: result.directoriesScanned,
        discoveredVideos: result.discoveredVideos,
        failedDirectories: result.failedDirectories,
        message: result.truncated ? '扫描完成，但已达到本次导入上限' : `扫描完成，共发现 ${result.discoveredVideos} 个视频`
      })
      return { result, items }
    } catch (error) {
      if (isMediaImportInboxScanAbortError(error)) {
        const result = { status: 'cancelled', files: [], scannedDirectories: [], directoriesScanned: 0, discoveredVideos: 0, failedDirectories: 0, truncated: false } as MediaImportInboxScanResponse['result']
        sendProgress(event.sender, { status: 'cancelled', directoriesScanned: 0, discoveredVideos: 0, failedDirectories: 0, message: '本地导入收件箱扫描已取消' })
        return { result, items: getMediaImportInboxStore().listItems() }
      }
      const message = error instanceof Error ? error.message : String(error)
      sendProgress(event.sender, { status: 'error', directoriesScanned: 0, discoveredVideos: 0, failedDirectories: 0, error: message, message })
      throw error
    } finally {
      if (scanControllers.get(senderId) === controller) scanControllers.delete(senderId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_SCAN_CANCEL, (event: IpcMainInvokeEvent) => {
    const controller = scanControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_TRANSITION, async (_event: IpcMainInvokeEvent, value: unknown) => {
    const request = asTransitionRequest(value)
    if (!request) return null
    const store = getMediaImportInboxStore()
    const item = store.transition(request.itemId, request.status, request.error)
    if (item) {
      await store.persist()
      if (item.status === 'queued') getMediaImportInboxProcessor().enqueue(item.id)
    }
    return item
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_BATCH_TRANSITION, async (_event: IpcMainInvokeEvent, value: unknown) => {
    const request = asBatchTransitionRequest(value)
    if (!request) return null
    const store = getMediaImportInboxStore()
    const items = store.transitionBatch(request.itemIds, request.action)
    if (!items) return null
    await store.persist()
    for (const item of items) {
      if (item.status === 'queued') getMediaImportInboxProcessor().enqueue(item.id)
    }
    return items
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_METADATA_UPDATE, async (_event: IpcMainInvokeEvent, value: unknown) => {
    const request = asMetadataUpdateRequest(value)
    if (!request) return null
    return getMediaImportInboxStore().updateMetadata(request.itemId, request.patch, request.writeSidecar)
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_WATCH_START, (event: IpcMainInvokeEvent, value: unknown): MediaImportInboxWatchStartResult => {
    stopWatcherForSender(event.sender)
    const request = asWatchRequest(value)
    const watcher = createMediaImportInboxWatcher({
      directories: request.directories,
      recursive: request.recursive,
      onChange: (directories) => {
        if (event.sender.isDestroyed()) return
        const payload: MediaImportInboxDirectoriesChangedEvent = { directories: [...directories] }
        event.sender.send(IPC_CHANNELS.MEDIA_IMPORT_INBOX_DIRECTORIES_CHANGED, payload)
      }
    })
    const onDestroyed = (): void => stopWatcherForSender(event.sender)
    watchStates.set(event.sender.id, { sender: event.sender, watcher, onDestroyed })
    event.sender.once('destroyed', onDestroyed)
    return { directories: [...request.directories], watchedDirectories: watcher.watchedDirectories }
  })

  ipcMain.handle(IPC_CHANNELS.MEDIA_IMPORT_INBOX_WATCH_STOP, (event: IpcMainInvokeEvent): void => {
    stopWatcherForSender(event.sender)
  })

  getMediaImportInboxProcessor().resume()
}

export function stopMediaImportInboxIpc(): void {
  desktopState.mediaImportInboxProcessor?.stop()
  for (const controller of scanControllers.values()) controller.abort()
  scanControllers.clear()
  for (const state of [...watchStates.values()]) stopWatcherForSender(state.sender)
}
