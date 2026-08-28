import { useEffect } from 'react'
import type { ClipExportLengthSeconds, ClipExportMode } from '../../../shared/clip-export'
import type { SubtitleTargetLanguageId } from '../../../shared/app-settings'
import {
  createAppSettingsSectionPatcher,
  createDefaultAppSettings,
  updateAppSettingsSection,
  type AppSettingsSectionPatcher
} from '../../../shared/app-settings'
import type { AsrTranslationServiceTestRequest, AsrTranslationServiceTestResult } from '../../../shared/media-types'
import { MANAGED_TRANSLATION_SERVICE_ENDPOINT } from '../../../shared/translation-service'
import { resolveActiveAiProvider } from '../../../shared/ai-providers'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export function useSettingsActions(model: AppModel, derived: AppDerived) {
  const { appSettings, setAppSettings } = model
  const patchAppSettings = (updater: (current: typeof appSettings) => typeof appSettings): void => {
    setAppSettings((current) => {
      const next = updater(current)
      void window.aiv.setAppSettings(next).catch(() => undefined)
      return next
    })
  }

  const patchAppSettingsSection: AppSettingsSectionPatcher = createAppSettingsSectionPatcher(patchAppSettings)
  const syncClipExportPreferences = (durationSeconds: ClipExportLengthSeconds, mode: ClipExportMode): void => {
    patchAppSettingsSection('capture', { clipExportLengthSeconds: durationSeconds, clipExportMode: mode })
  }
  const patchSubtitleDisplaySettings = (patch: Partial<typeof appSettings.subtitles>): void => {
    patchAppSettingsSection('subtitles', patch)
  }
  const changeBatchTargetLanguage = (targetLanguage: SubtitleTargetLanguageId): void => {
    if (targetLanguage !== appSettings.subtitles.targetLanguage) patchAppSettingsSection('subtitles', { targetLanguage })
  }
  const resetSubtitleDisplaySettings = (): void => {
    patchAppSettingsSection('subtitles', createDefaultAppSettings().subtitles)
  }
  const resetAppSettings = (): void => {
    const defaults = createDefaultAppSettings()
    setAppSettings(defaults)
    model.setState((current) => ({
      ...current,
      panelMode: defaults.ui.defaultPanelMode,
      volume: defaults.playback.lastVolume,
      muted: defaults.playback.lastMuted,
      playbackRate: defaults.playback.lastPlaybackRate
    }))
    void window.aiv.setAppSettings(defaults).then((nextSettings) => setAppSettings(nextSettings)).catch(() => undefined)
  }
  const restartWithGpuAcceleration = async (gpuAcceleration: boolean): Promise<void> => {
    const nextSettings = updateAppSettingsSection(appSettings, 'playback', { gpuAcceleration })
    setAppSettings(nextSettings)
    await window.aiv.setAppSettings(nextSettings)
    await window.aiv.restartApp()
  }
  const pickDefaultFolder = async (): Promise<string | null> => window.aiv.openMediaDirectory()
  const pickCaptureFolder = async (): Promise<string | null> => window.aiv.openFolderPicker({
    title: derived.copy.settingsDialog.capture.selectFolderDialogTitle,
    defaultPath: appSettings.capture.saveDirectoryPath
  })
  const autoDetectWhisperBinary = async (): Promise<void> => {
    model.setIsDetectingWhisperBinary(true)
    model.setRuntimeSetupMessage(null)
    try {
      const result = await window.aiv.autoDetectWhisperBinary()
      if (result.status) model.setAsrStatus(result.status)
      model.setRuntimeSetupMessage({ success: result.success, message: result.message })
    } finally {
      model.setIsDetectingWhisperBinary(false)
    }
  }
  const selectWhisperBinary = async (): Promise<void> => {
    model.setIsSelectingWhisperBinary(true)
    model.setRuntimeSetupMessage(null)
    try {
      const result = await window.aiv.selectWhisperBinary()
      if (result.status) model.setAsrStatus(result.status)
      if (!result.canceled) model.setRuntimeSetupMessage({ success: result.success, message: result.message })
    } finally {
      model.setIsSelectingWhisperBinary(false)
    }
  }
  const activeAiProvider = resolveActiveAiProvider(appSettings.ai.providers, appSettings.ai.activeProviderId)
  const testTranslationService = async (provider?: AsrTranslationServiceTestRequest['provider']): Promise<void> => {
    if (model.isTestingTranslationService) return
    model.setIsTestingTranslationService(true)
    model.setTranslationServiceTestMessage(null)
    try {
      const result = await window.aiv.testAsrTranslationService({
        sourceLanguage: derived.subtitleTranslationSourceLanguage,
        targetLanguage: appSettings.subtitles.targetLanguage,
        provider
      })
      model.setTranslationServiceTestMessage(result)
    } catch (error) {
      const fallback: AsrTranslationServiceTestResult = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        sourceLanguage: derived.subtitleTranslationSourceLanguage,
        targetLanguage: appSettings.subtitles.targetLanguage,
        translationModel: derived.subtitleTranslationModel || undefined,
        translationBaseUrlSummary: activeAiProvider.kind === 'managed'
          ? MANAGED_TRANSLATION_SERVICE_ENDPOINT
          : activeAiProvider.baseUrl?.trim() || undefined
      }
      model.setTranslationServiceTestMessage(fallback)
    } finally {
      model.setIsTestingTranslationService(false)
    }
  }

  useEffect(() => {
    model.setTranslationServiceTestMessage(null)
  }, [activeAiProvider.id, derived.subtitleTranslationGlossary, derived.subtitleTranslationSourceLanguage, appSettings.subtitles.targetLanguage])

  return {
    patchAppSettingsSection,
    syncClipExportPreferences,
    patchSubtitleDisplaySettings,
    changeBatchTargetLanguage,
    resetSubtitleDisplaySettings,
    resetAppSettings,
    restartWithGpuAcceleration,
    pickDefaultFolder,
    pickCaptureFolder,
    autoDetectWhisperBinary,
    selectWhisperBinary,
    testTranslationService
  }
}
