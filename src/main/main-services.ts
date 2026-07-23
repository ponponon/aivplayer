import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getBatchSubtitleHistoryPath, getBatchSubtitleLogDirectoryPath, getBatchSubtitleStatePath, BatchSubtitleManager } from './ai/batch-subtitle-manager'
import { createWhisperCppRuntime } from './ai/whisper-cpp-runtime'
import { VisionLibrary } from './ai/vision-library'
import { getCurrentLocale } from './main-settings'
import { mainState } from './main-state'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { BatchSubtitleJob } from '../shared/media-types'

export function resolveAppIconPath(): string | null {
  const iconPath = process.env.ELECTRON_RENDERER_URL ? resolve(process.cwd(), 'brand/icon.png') : join(process.resourcesPath, 'app-icon.png')
  return existsSync(iconPath) ? iconPath : null
}

export function resolveResourcePath(): string {
  if (process.env.AIVPLAYER_RESOURCE_DIR) return resolve(process.env.AIVPLAYER_RESOURCE_DIR)
  return process.env.ELECTRON_RENDERER_URL || !app.isPackaged ? resolve('resources') : process.resourcesPath
}

export function getAsrRuntime(): ReturnType<typeof createWhisperCppRuntime> {
  if (!mainState.asrRuntime) {
    mainState.asrRuntime = createWhisperCppRuntime({
      userDataPath: app.getPath('userData'),
      resourcePath: resolveResourcePath(),
      getLocale: getCurrentLocale,
      getTranslationServiceSettings: () => ({
        translationBaseUrl: mainState.currentAppSettings.asr.translationBaseUrl,
        translationModel: mainState.currentAppSettings.asr.translationModel,
        translationApiKey: mainState.currentAppSettings.asr.translationApiKey,
        translationGlossary: mainState.currentAppSettings.asr.translationGlossary
      })
    })
  }
  return mainState.asrRuntime
}

export function getVisionLibrary(): VisionLibrary {
  if (!mainState.visionLibrary) {
    mainState.visionLibrary = new VisionLibrary({
      userDataPath: app.getPath('userData'),
      resourcePath: resolveResourcePath(),
      env: process.env
    })
  }
  return mainState.visionLibrary
}

export function getBatchSubtitleManager(sender: Electron.WebContents): BatchSubtitleManager {
  const emit = (job: BatchSubtitleJob): void => {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.BATCH_SUBTITLE_PROGRESS, job)
  }
  if (!mainState.batchSubtitleManager) {
    mainState.batchSubtitleManager = new BatchSubtitleManager({
      runtime: getAsrRuntime(),
      stateFilePath: getBatchSubtitleStatePath(app.getPath('userData')),
      logDirectoryPath: getBatchSubtitleLogDirectoryPath(app.getPath('userData')),
      historyFilePath: getBatchSubtitleHistoryPath(app.getPath('userData')),
      emit
    })
  } else mainState.batchSubtitleManager.setEmitter(emit)
  return mainState.batchSubtitleManager
}
