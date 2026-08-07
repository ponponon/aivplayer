import { app, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { VisionClipCollectionExportFormat, VisionClipCollectionExportRequest, VisionClipCollectionInput, VisionDirectoryScanRequest, VisionIndexRequest, VisionSearchRequest } from '../shared/vision-types'
import { scanVisionDirectory, isVisionScanAbortError } from '../core/ai/vision-directory-scan'
import { renderVisionClipCollectionExport } from '../core/ai/clip-inbox-export'
import { getClipInboxStore, getVisionIndexQueue, getVisionLibrary } from './desktop-services'
import { desktopState } from './desktop-state'
import { promptForSavePath } from './media-dialogs'

function normalizeMediaPaths(request: VisionIndexRequest): string[] {
  if (!request || !Array.isArray(request.mediaPaths)) return []
  return Array.from(new Set(request.mediaPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)))
}

function isVisionClipCollectionExportFormat(value: unknown): value is VisionClipCollectionExportFormat {
  return value === 'json' || value === 'csv' || value === 'edl'
}

function safeExportTitle(title: string): string {
  return title.trim().replace(/[\\/:*?"<>|]/g, '_').slice(0, 120) || 'clip-collection'
}

export function registerVisionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VISION_STATUS, () => getVisionLibrary().getStatus())

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_START, async (event, request: VisionIndexRequest) => {
    const senderId = event.sender.id
    getVisionIndexQueue().cancel()
    desktopState.visionAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    desktopState.visionAbortControllers.set(senderId, controller)
    try {
      return await getVisionLibrary().indexVideos(
        normalizeMediaPaths(request),
        request?.intervalSeconds,
        controller.signal,
        (progress) => {
          if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.VISION_INDEX_PROGRESS, progress)
        }
      )
    } finally {
      if (desktopState.visionAbortControllers.get(senderId) === controller) desktopState.visionAbortControllers.delete(senderId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_AUTO_START, (event, request: VisionIndexRequest) => {
    const mediaPaths = normalizeMediaPaths(request)
    if (mediaPaths.length === 0) return false
    getVisionIndexQueue().enqueue(mediaPaths, request?.intervalSeconds, (progress) => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.VISION_INDEX_PROGRESS, progress)
    })
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_CANCEL, (event) => {
    const queueCancelled = getVisionIndexQueue().cancel()
    const controller = desktopState.visionAbortControllers.get(event.sender.id)
    if (!controller) return queueCancelled
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SCAN_DIRECTORY_START, async (event, request: VisionDirectoryScanRequest) => {
    const directoryPath = typeof request?.directoryPath === 'string' ? request.directoryPath.trim() : ''
    if (!directoryPath) throw new Error('请选择影视库文件夹')
    const senderId = event.sender.id
    desktopState.visionScanAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    desktopState.visionScanAbortControllers.set(senderId, controller)
    const sendProgress = (progress: Parameters<Parameters<typeof scanVisionDirectory>[3]>[0]): void => {
      if (!event.sender.isDestroyed()) event.sender.send(IPC_CHANNELS.VISION_SCAN_DIRECTORY_PROGRESS, progress)
    }
    try {
      const result = await scanVisionDirectory(directoryPath, request.recursive === true, controller.signal, sendProgress)
      sendProgress({ status: 'completed', directoryPath: result.directoryPath, scannedDirectories: result.scannedDirectories, discoveredVideos: result.discoveredVideos, message: `扫描完成，共发现 ${result.discoveredVideos} 个视频` })
      return result
    } catch (error) {
      if (isVisionScanAbortError(error)) {
        const result = { status: 'cancelled', directoryPath, files: [], scannedDirectories: 0, discoveredVideos: 0 } as const
        sendProgress({ status: 'cancelled', directoryPath, scannedDirectories: 0, discoveredVideos: 0, message: '影视库文件夹扫描已取消' })
        return result
      }
      const message = error instanceof Error ? error.message : String(error)
      sendProgress({ status: 'error', directoryPath, scannedDirectories: 0, discoveredVideos: 0, error: message, message })
      throw error
    } finally {
      if (desktopState.visionScanAbortControllers.get(senderId) === controller) desktopState.visionScanAbortControllers.delete(senderId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SCAN_DIRECTORY_CANCEL, (event) => {
    const controller = desktopState.visionScanAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_TEXT, (_event, request: VisionSearchRequest) => {
    if (!request?.query?.trim()) return []
    return getVisionLibrary().searchText(request.query, request.limit, request.mode)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_IMAGE, (_event, request: VisionSearchRequest) => {
    if (!request?.imagePath?.trim()) return []
    return getVisionLibrary().searchImage(request.imagePath, request.limit)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_READ_THUMBNAIL, (_event, thumbnailPath: string) => getVisionLibrary().readThumbnail(thumbnailPath))
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_LIST, () => getClipInboxStore().listCollections())
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_SAVE, (_event, input: VisionClipCollectionInput) => getClipInboxStore().saveCollection(input))
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_DELETE, (_event, collectionId: string) => {
    if (typeof collectionId !== 'string' || !collectionId.trim()) return false
    return getClipInboxStore().deleteCollection(collectionId.trim())
  })
  ipcMain.handle(IPC_CHANNELS.VISION_CLIP_COLLECTION_EXPORT, async (_event, request: VisionClipCollectionExportRequest) => {
    if (!request || typeof request.collectionId !== 'string' || !request.collectionId.trim() || !isVisionClipCollectionExportFormat(request.format)) {
      return { success: false, message: '导出参数无效' }
    }
    const collection = getClipInboxStore().getCollection(request.collectionId.trim())
    if (!collection) return { success: false, message: '选段集合不存在' }
    const extension = request.format
    const defaultPath = join(app.getPath('documents'), `${safeExportTitle(collection.title)}.${extension}`)
    const filePath = await promptForSavePath({
      title: `导出选段集合 · ${collection.title}`,
      defaultPath,
      filters: [{ name: `${extension.toUpperCase()} files`, extensions: [extension] }]
    })
    if (!filePath) return { success: false, canceled: true, message: '已取消导出' }
    const outputPath = filePath.toLowerCase().endsWith(`.${extension}`) ? filePath : `${filePath}.${extension}`
    try {
      await writeFile(outputPath, renderVisionClipCollectionExport(collection, request.format), 'utf8')
      return { success: true, filePath: outputPath, message: `已导出 ${outputPath}` }
    } catch (error) {
      return { success: false, message: error instanceof Error ? error.message : String(error) }
    }
  })
}
