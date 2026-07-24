import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getBatchSubtitleHistoryPath, getBatchSubtitleLogDirectoryPath, getBatchSubtitleStatePath, BatchSubtitleManager } from '../core/ai/batch-subtitle-manager'
import { createWhisperCppRuntime } from '../core/ai/whisper-cpp-runtime'
import { VisionLibrary } from '../core/ai/vision-library'
import { VisionIndexQueue } from '../core/ai/vision-index-queue'
import { createDramaProviderFromConfig, createDramaProviderFromEnvironment, DramaProviderError } from '../core/drama/drama-provider'
import { DramaStore } from '../core/drama/drama-store'
import { DramaWorkflow } from '../core/drama/drama-workflow'
import type { DramaProviderSettings, DramaProviderSettingsInput, DramaProviderTestResult } from '../shared/drama-types'
import { saveAppSettings } from './desktop-settings'
import { getCurrentLocale } from './desktop-settings'
import { desktopState } from './desktop-state'
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
  if (!desktopState.asrRuntime) {
    desktopState.asrRuntime = createWhisperCppRuntime({
      userDataPath: app.getPath('userData'),
      resourcePath: resolveResourcePath(),
      getLocale: getCurrentLocale,
      getTranslationServiceSettings: () => ({
        translationBaseUrl: desktopState.currentAppSettings.asr.translationBaseUrl,
        translationModel: desktopState.currentAppSettings.asr.translationModel,
        translationApiKey: desktopState.currentAppSettings.asr.translationApiKey,
        translationGlossary: desktopState.currentAppSettings.asr.translationGlossary
      })
    })
  }
  return desktopState.asrRuntime
}

export function getVisionLibrary(): VisionLibrary {
  if (!desktopState.visionLibrary) {
    desktopState.visionLibrary = new VisionLibrary({
      userDataPath: app.getPath('userData'),
      resourcePath: resolveResourcePath(),
      env: process.env
    })
  }
  return desktopState.visionLibrary
}

export function getVisionIndexQueue(): VisionIndexQueue {
  if (!desktopState.visionIndexQueue) {
    desktopState.visionIndexQueue = new VisionIndexQueue((mediaPaths, intervalSeconds, signal, onProgress) =>
      getVisionLibrary().indexVideos(mediaPaths, intervalSeconds, signal, onProgress)
    )
  }
  return desktopState.visionIndexQueue
}

export function getBatchSubtitleManager(sender: Electron.WebContents): BatchSubtitleManager {
  const emit = (job: BatchSubtitleJob): void => {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.BATCH_SUBTITLE_PROGRESS, job)
  }
  if (!desktopState.batchSubtitleManager) {
    desktopState.batchSubtitleManager = new BatchSubtitleManager({
      runtime: getAsrRuntime(),
      stateFilePath: getBatchSubtitleStatePath(app.getPath('userData')),
      logDirectoryPath: getBatchSubtitleLogDirectoryPath(app.getPath('userData')),
      historyFilePath: getBatchSubtitleHistoryPath(app.getPath('userData')),
      emit
    })
  } else desktopState.batchSubtitleManager.setEmitter(emit)
  return desktopState.batchSubtitleManager
}

export function getDramaStore(): DramaStore {
  if (!desktopState.dramaStore) desktopState.dramaStore = new DramaStore(app.getPath('userData'))
  return desktopState.dramaStore
}

export function getDramaWorkflow(): DramaWorkflow {
  return new DramaWorkflow(getDramaStore(), getDramaProvider())
}

export function getDramaProviderSettings(): DramaProviderSettings {
  const drama = desktopState.currentAppSettings.drama
  return {
    apiBaseUrl: drama.apiBaseUrl,
    model: drama.model,
    useMock: drama.useMock,
    apiKeyConfigured: Boolean(drama.apiKey)
  }
}

export async function saveDramaProviderSettings(input: DramaProviderSettingsInput): Promise<DramaProviderSettings> {
  const current = desktopState.currentAppSettings
  const drama = current.drama
  const next = {
    ...current,
    drama: {
      apiBaseUrl: typeof input.apiBaseUrl === 'string' ? input.apiBaseUrl.trim() || null : input.apiBaseUrl === null ? null : drama.apiBaseUrl,
      model: typeof input.model === 'string' ? input.model.trim() || null : input.model === null ? null : drama.model,
      apiKey: input.apiKey === undefined ? drama.apiKey : typeof input.apiKey === 'string' ? input.apiKey.trim() || null : null,
      useMock: typeof input.useMock === 'boolean' ? input.useMock : drama.useMock
    }
  }
  await saveAppSettings(next)
  return getDramaProviderSettings()
}

export async function testDramaProvider(): Promise<DramaProviderTestResult> {
  const settings = desktopState.currentAppSettings.drama
  const usedMock = settings.useMock
  try {
    const provider = getDramaProvider()
    const response = await provider.generate({
      stage: 'events',
      system: '只返回一句简短测试文本。',
      user: '请回复“短剧服务连接成功”。'
    })
    return { success: Boolean(response.trim()), message: usedMock ? '本地 Mock 短剧服务可用' : '短剧 AI 服务连接成功', model: settings.model, usedMock }
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : String(error), model: settings.model, usedMock }
  }
}

function getDramaProvider() {
  const settings = desktopState.currentAppSettings.drama
  if (settings.useMock || settings.apiBaseUrl || settings.model || settings.apiKey) {
    return createDramaProviderFromConfig({ baseUrl: settings.apiBaseUrl, apiKey: settings.apiKey, model: settings.model, useMock: settings.useMock })
  }
  try {
    return createDramaProviderFromEnvironment()
  } catch (error) {
    if (error instanceof DramaProviderError) throw error
    throw error
  }
}
