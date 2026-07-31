import { app, ipcMain } from 'electron'
import { downloadPersonMatteModel } from '../core/ai/person-matte-downloader'
import { getPersonMatteModelStatus } from '../core/ai/person-matte-model'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { PersonMatteModelDownloadResult, PersonMatteModelStatus } from '../shared/person-matte-types'
import { resolveResourcePath } from './desktop-services'

let downloadPromise: Promise<PersonMatteModelDownloadResult> | null = null

function getCurrentPersonMatteStatus(): PersonMatteModelStatus {
  return getPersonMatteModelStatus(resolveResourcePath(), app.getPath('userData'))
}

export function registerPersonMatteIpc(): void {
  ipcMain.handle(IPC_CHANNELS.PERSON_MATTE_STATUS, (): PersonMatteModelStatus => getCurrentPersonMatteStatus())
  ipcMain.handle(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD, async (event): Promise<PersonMatteModelDownloadResult> => {
    if (downloadPromise) return downloadPromise
    const sender = event.sender
    downloadPromise = (async () => {
      try {
        await downloadPersonMatteModel({
          modelRoot: app.getPath('userData'),
          onProgress: (progress) => {
            if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.PERSON_MATTE_DOWNLOAD_PROGRESS, progress)
          }
        })
        const status = getCurrentPersonMatteStatus()
        return { success: status.available, message: status.available ? '人物抠像模型下载完成' : status.message, status }
      } catch (error) {
        const status = getCurrentPersonMatteStatus()
        return { success: false, message: error instanceof Error ? error.message : String(error), status }
      } finally {
        downloadPromise = null
      }
    })()
    return downloadPromise
  })
}
