import { app } from 'electron'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { getBatchSubtitleHistoryPath, getBatchSubtitleLogDirectoryPath, getBatchSubtitleStatePath, BatchSubtitleManager } from '../core/ai/batch-subtitle-manager'
import { createWhisperCppRuntime } from '../core/ai/whisper-cpp-runtime'
import { VisionLibrary } from '../core/ai/vision-library'
import { VisionIndexQueue } from '../core/ai/vision-index-queue'
import { VisionIndexCoordinator } from '../core/ai/vision-index-coordinator'
import { createDramaProviderFromConfig, createDramaProviderFromEnvironment, DramaProviderError } from '../core/drama/drama-provider'
import { createDramaMediaProviders, toPublicDramaMediaProviderSettings } from '../core/drama/drama-media-provider-registry'
import { DramaStore } from '../core/drama/drama-store'
import { DramaGenerationWorker } from '../core/drama/drama-generation-worker'
import { ClipInboxStore } from '../core/ai/clip-inbox-store'
import { MediaImportInboxStore } from '../core/media/media-import-inbox'
import { createDefaultMediaImportInboxProcessorDependencies, MediaImportInboxProcessor } from '../core/media/media-import-inbox-processor'
import { VisionIndexFailureStore } from '../core/ai/vision-index-failure-store'
import { DramaWorkflow } from '../core/drama/drama-workflow'
import type { DramaProviderSettings, DramaProviderSettingsInput, DramaProviderTestResult } from '../shared/drama-types'
import { saveAppSettings } from './desktop-settings'
import { getCurrentLocale } from './desktop-settings'
import { desktopState } from './desktop-state'
import { IPC_CHANNELS } from '../shared/ipc-channels'
import type { BatchSubtitleJob } from '../shared/media-types'
import type { DramaGenerationTask } from '../shared/drama-types'
import type { VisionIndexFailureInput } from '../core/ai/vision-index-failure'
import type { VisionIndexProgress } from '../shared/vision-types'
import { visionIndexFailureFromProgress as getVisionIndexFailureInput } from '../core/ai/vision-index-failure'
import type { MediaImportInboxItem, MediaImportInboxPipelineProgress } from '../shared/media-import-inbox'
import { createBatchSubtitleTaskCenterEvent, createDramaGenerationTaskCenterEvent, createMediaImportTaskCenterEvent } from '../core/tasks/task-center-adapters'
import { sendTaskCenterEvent } from './task-center-events'

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

export function getVisionIndexCoordinator(): VisionIndexCoordinator {
  if (!desktopState.visionIndexCoordinator) {
    desktopState.visionIndexCoordinator = new VisionIndexCoordinator((mediaPaths, intervalSeconds, signal, onProgress, options) =>
      getVisionLibrary().indexVideos(mediaPaths, intervalSeconds, signal, onProgress, options)
    )
  }
  return desktopState.visionIndexCoordinator
}

export function getVisionIndexQueue(): VisionIndexQueue {
  if (!desktopState.visionIndexQueue) {
    desktopState.visionIndexQueue = new VisionIndexQueue((mediaPaths, intervalSeconds, signal, onProgress, options) =>
      getVisionIndexCoordinator().run(mediaPaths, intervalSeconds, signal, onProgress, options)
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

export function getDramaGenerationWorker(): DramaGenerationWorker {
  if (!desktopState.dramaGenerationWorker) {
    desktopState.dramaGenerationWorker = new DramaGenerationWorker(getDramaStore(), {
      providers: createDramaGenerationProviders(),
      onTask: (task: DramaGenerationTask) => {
        const sender = desktopState.mainWindow?.webContents
        if (sender && !sender.isDestroyed()) sender.send(IPC_CHANNELS.DRAMA_GENERATION_PROGRESS, task)
        sendTaskCenterEvent(createDramaGenerationTaskCenterEvent(task))
      }
    })
  } else desktopState.dramaGenerationWorker.setProviders(createDramaGenerationProviders())
  return desktopState.dramaGenerationWorker
}

export function getClipInboxStore(): ClipInboxStore {
  if (!desktopState.clipInboxStore) desktopState.clipInboxStore = new ClipInboxStore(app.getPath('userData'))
  return desktopState.clipInboxStore
}

export function getVisionIndexFailureStore(): VisionIndexFailureStore {
  if (!desktopState.visionIndexFailureStore) desktopState.visionIndexFailureStore = new VisionIndexFailureStore(app.getPath('userData'))
  return desktopState.visionIndexFailureStore
}

export function trackVisionIndexProgress(
  progress: VisionIndexProgress,
  mediaPaths: readonly string[],
  options: Pick<VisionIndexFailureInput, 'intervalSeconds' | 'includeSceneEvidence' | 'includeEntityEvidence'> = {}
): void {
  const store = getVisionIndexFailureStore()
  const failure = getVisionIndexFailureInput(progress, options)
  if (failure) store.recordFailure(failure)
  if (progress.status === 'completed') {
    for (const mediaPath of mediaPaths) store.clear(mediaPath)
  }
}

export function getMediaImportInboxStore(): MediaImportInboxStore {
  if (!desktopState.mediaImportInboxStore) desktopState.mediaImportInboxStore = new MediaImportInboxStore(app.getPath('userData'))
  return desktopState.mediaImportInboxStore
}

export function getMediaImportInboxProcessor(): MediaImportInboxProcessor {
  if (!desktopState.mediaImportInboxProcessor) {
    const mainWindowEvents = {
      onItemChanged: (item: MediaImportInboxItem): void => {
        const sender = desktopState.mainWindow?.webContents
        if (sender && !sender.isDestroyed()) sender.send(IPC_CHANNELS.MEDIA_IMPORT_INBOX_ITEM_CHANGED, item)
      },
      onProgress: (progress: MediaImportInboxPipelineProgress): void => {
        const sender = desktopState.mainWindow?.webContents
        if (sender && !sender.isDestroyed()) sender.send(IPC_CHANNELS.MEDIA_IMPORT_INBOX_PIPELINE_PROGRESS, progress)
        const item = getMediaImportInboxStore().listItems().find((candidate) => candidate.id === progress.itemId)
        sendTaskCenterEvent(createMediaImportTaskCenterEvent(progress, item))
      }
    }
    const dependencies = createDefaultMediaImportInboxProcessorDependencies(
      getMediaImportInboxStore(),
      resolveResourcePath(),
      (mediaPath, signal, onProgress) => getVisionIndexCoordinator().run([mediaPath], 3, signal, (progress) => {
        trackVisionIndexProgress(progress, [mediaPath], { intervalSeconds: 3 })
        onProgress(progress)
      }),
      mainWindowEvents
    )
    desktopState.mediaImportInboxProcessor = new MediaImportInboxProcessor(dependencies)
  }
  return desktopState.mediaImportInboxProcessor
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
    apiKeyConfigured: Boolean(drama.apiKey),
    media: {
      image: toPublicDramaMediaProviderSettings(drama.media.image),
      video: toPublicDramaMediaProviderSettings(drama.media.video),
      audio: toPublicDramaMediaProviderSettings(drama.media.audio)
    }
  }
}

export async function saveDramaProviderSettings(input: DramaProviderSettingsInput): Promise<DramaProviderSettings> {
  const current = desktopState.currentAppSettings
  const drama = current.drama
  const media = { ...drama.media }
  for (const mediaType of ['image', 'video', 'audio'] as const) {
    const patch = input.media?.[mediaType]
    if (!patch) continue
    const existing = drama.media[mediaType]
    media[mediaType] = {
      providerId: patch.providerId === undefined ? existing.providerId : patch.providerId,
      apiBaseUrl: patch.apiBaseUrl === undefined ? existing.apiBaseUrl : patch.apiBaseUrl,
      model: patch.model === undefined ? existing.model : patch.model,
      apiKey: patch.apiKey === undefined ? existing.apiKey : patch.apiKey,
      costPerRequest: patch.costPerRequest === undefined ? existing.costPerRequest : patch.costPerRequest
    }
  }
  const next = {
    ...current,
    drama: {
      apiBaseUrl: typeof input.apiBaseUrl === 'string' ? input.apiBaseUrl.trim() || null : input.apiBaseUrl === null ? null : drama.apiBaseUrl,
      model: typeof input.model === 'string' ? input.model.trim() || null : input.model === null ? null : drama.model,
      apiKey: input.apiKey === undefined ? drama.apiKey : typeof input.apiKey === 'string' ? input.apiKey.trim() || null : null,
      useMock: typeof input.useMock === 'boolean' ? input.useMock : drama.useMock,
      media
    }
  }
  await saveAppSettings(next)
  if (desktopState.dramaGenerationWorker) desktopState.dramaGenerationWorker.setProviders(createDramaGenerationProviders())
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

function createDramaGenerationProviders() {
  return createDramaMediaProviders(desktopState.currentAppSettings.drama.media, {
    outputDirectory: join(app.getPath('userData'), 'drama', 'generated')
  })
}
