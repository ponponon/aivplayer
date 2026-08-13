import { app, ipcMain } from 'electron'
import { isAbsolute } from 'node:path'
import { getVisionObjectDetectionModelStatus } from '../core/ai/vision-object-detection-model'
import { VisionObjectDetectionRuntime } from '../core/ai/vision-object-detection-runtime'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { VisionObjectDetectionModelStatus, VisionObjectDetectionRequest, VisionObjectDetectionResponse } from '../shared/vision-object-detection-types'
import { desktopState } from './desktop-state'
import { resolveResourcePath } from './desktop-services'

function getCurrentVisionObjectDetectionStatus(): VisionObjectDetectionModelStatus {
  return getVisionObjectDetectionModelStatus(
    app.getPath('userData'),
    process.platform,
    process.arch,
    desktopState.currentAppSettings.vision.objectDetectionModelDirectory
  )
}

function normalizeRequest(value: unknown): VisionObjectDetectionRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const request = value as Partial<VisionObjectDetectionRequest>
  const imagePath = typeof request.imagePath === 'string' ? request.imagePath.trim() : ''
  if (!imagePath || !isAbsolute(imagePath)) return null
  const threshold = typeof request.threshold === 'number' && Number.isFinite(request.threshold)
    ? Math.min(1, Math.max(0, request.threshold))
    : undefined
  return { imagePath, ...(threshold === undefined ? {} : { threshold }) }
}

function getFailureMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function registerVisionObjectDetectionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VISION_OBJECT_DETECTION_STATUS, (): VisionObjectDetectionModelStatus => getCurrentVisionObjectDetectionStatus())
  ipcMain.handle(IPC_CHANNELS.VISION_OBJECT_DETECTION_RUN, async (_event, value: unknown): Promise<VisionObjectDetectionResponse> => {
    const status = getCurrentVisionObjectDetectionStatus()
    const request = normalizeRequest(value)
    if (!request) return { success: false, message: '物体检测请求无效，需要绝对图片路径', status, result: null }
    if (!status.available) return { success: false, message: status.message, status, result: null }
    try {
      const runtime = new VisionObjectDetectionRuntime({
        resourcePath: resolveResourcePath(),
        userDataPath: app.getPath('userData'),
        modelDirectory: desktopState.currentAppSettings.vision.objectDetectionModelDirectory,
        platform: process.platform,
        arch: process.arch
      })
      const result = await runtime.detectImage(request.imagePath, request.threshold)
      return { success: true, message: `物体检测完成，共发现 ${result.detections.length} 个候选`, status, result }
    } catch (error) {
      return { success: false, message: `物体检测失败：${getFailureMessage(error)}`, status, result: null }
    }
  })
}
