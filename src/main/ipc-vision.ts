import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { VisionDirectoryScanRequest, VisionIndexRequest, VisionSearchRequest } from '../shared/vision-types'
import { scanVisionDirectory, isVisionScanAbortError } from './ai/vision-directory-scan'
import { getVisionIndexQueue, getVisionLibrary } from './main-services'
import { mainState } from './main-state'

function normalizeMediaPaths(request: VisionIndexRequest): string[] {
  if (!request || !Array.isArray(request.mediaPaths)) return []
  return Array.from(new Set(request.mediaPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)))
}

export function registerVisionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VISION_STATUS, () => getVisionLibrary().getStatus())

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_START, async (event, request: VisionIndexRequest) => {
    const senderId = event.sender.id
    getVisionIndexQueue().cancel()
    mainState.visionAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    mainState.visionAbortControllers.set(senderId, controller)
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
      if (mainState.visionAbortControllers.get(senderId) === controller) mainState.visionAbortControllers.delete(senderId)
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
    const controller = mainState.visionAbortControllers.get(event.sender.id)
    if (!controller) return queueCancelled
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SCAN_DIRECTORY_START, async (event, request: VisionDirectoryScanRequest) => {
    const directoryPath = typeof request?.directoryPath === 'string' ? request.directoryPath.trim() : ''
    if (!directoryPath) throw new Error('请选择影视库文件夹')
    const senderId = event.sender.id
    mainState.visionScanAbortControllers.get(senderId)?.abort()
    const controller = new AbortController()
    mainState.visionScanAbortControllers.set(senderId, controller)
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
      if (mainState.visionScanAbortControllers.get(senderId) === controller) mainState.visionScanAbortControllers.delete(senderId)
    }
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SCAN_DIRECTORY_CANCEL, (event) => {
    const controller = mainState.visionScanAbortControllers.get(event.sender.id)
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
}
