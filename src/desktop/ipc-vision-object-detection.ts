import { app, ipcMain } from 'electron'
import { getVisionObjectDetectionModelStatus } from '../core/ai/vision-object-detection-model'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { VisionObjectDetectionModelStatus } from '../shared/vision-object-detection-types'
import { desktopState } from './desktop-state'

function getCurrentVisionObjectDetectionStatus(): VisionObjectDetectionModelStatus {
  return getVisionObjectDetectionModelStatus(
    app.getPath('userData'),
    process.platform,
    process.arch,
    desktopState.currentAppSettings.vision.objectDetectionModelDirectory
  )
}

export function registerVisionObjectDetectionIpc(): void {
  ipcMain.handle(IPC_CHANNELS.VISION_OBJECT_DETECTION_STATUS, (): VisionObjectDetectionModelStatus => getCurrentVisionObjectDetectionStatus())
}
