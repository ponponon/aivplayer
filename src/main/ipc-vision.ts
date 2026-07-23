import { ipcMain } from 'electron'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { VisionIndexRequest, VisionSearchRequest } from '../shared/vision-types'
import { getVisionLibrary } from './main-services'
import { mainState } from './main-state'

function normalizeMediaPaths(request: VisionIndexRequest): string[] {
  if (!request || !Array.isArray(request.mediaPaths)) return []
  return Array.from(new Set(request.mediaPaths.filter((path): path is string => typeof path === 'string' && path.trim().length > 0)))
}

export function registerVisionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VISION_STATUS, () => getVisionLibrary().getStatus())

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_START, async (event, request: VisionIndexRequest) => {
    const senderId = event.sender.id
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

  ipcMain.handle(IPC_CHANNELS.VISION_INDEX_CANCEL, (event) => {
    const controller = mainState.visionAbortControllers.get(event.sender.id)
    if (!controller) return false
    controller.abort()
    return true
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_TEXT, (_event, request: VisionSearchRequest) => {
    if (!request?.query?.trim()) return []
    return getVisionLibrary().searchText(request.query, request.limit)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_SEARCH_IMAGE, (_event, request: VisionSearchRequest) => {
    if (!request?.imagePath?.trim()) return []
    return getVisionLibrary().searchImage(request.imagePath, request.limit)
  })

  ipcMain.handle(IPC_CHANNELS.VISION_READ_THUMBNAIL, (_event, thumbnailPath: string) => getVisionLibrary().readThumbnail(thumbnailPath))
}
