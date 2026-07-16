import { useEffect } from 'react'
import type { ClipExportLengthSeconds, ClipExportMode } from '../../../shared/clip-export'
import type { SubtitleTargetLanguageId } from '../../../shared/app-settings'
import {
  createAppSettingsSectionPatcher,
  createDefaultAppSettings,
  type AppSettingsSectionPatcher
} from '../../../shared/app-settings'
import type { AsrTranslationServiceTestResult } from '../../../shared/media-types'
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
  const testTranslationService = async (): Promise<void> => {
    if (model.isTestingTranslationService) return
    model.setIsTestingTranslationService(true)
    model.setTranslationServiceTestMessage(null)
    try {
      const result = await window.aiv.testAsrTranslationService({
        sourceLanguage: derived.subtitleTranslationSourceLanguage,
        targetLanguage: appSettings.subtitles.targetLanguage
      })
      model.setTranslationServiceTestMessage(result)
    } catch (error) {
      const fallback: AsrTranslationServiceTestResult = {
        success: false,
        message: error instanceof Error ? error.message : String(error),
        sourceLanguage: derived.subtitleTranslationSourceLanguage,
        targetLanguage: appSettings.subtitles.targetLanguage,
        translationModel: derived.subtitleTranslationModel || undefined,
        translationBaseUrlSummary: appSettings.asr.translationBaseUrl?.trim() || undefined
      }
      model.setTranslationServiceTestMessage(fallback)
    } finally {
      model.setIsTestingTranslationService(false)
    }
  }

  useEffect(() => {
    model.setTranslationServiceTestMessage(null)
  }, [appSettings.asr.translationBaseUrl, appSettings.asr.translationModel, derived.subtitleTranslationGlossary, derived.subtitleTranslationSourceLanguage, appSettings.subtitles.targetLanguage])

  return {
    patchAppSettingsSection,
    syncClipExportPreferences,
    patchSubtitleDisplaySettings,
    changeBatchTargetLanguage,
    resetSubtitleDisplaySettings,
    resetAppSettings,
    pickDefaultFolder,
    pickCaptureFolder,
    autoDetectWhisperBinary,
    selectWhisperBinary,
    testTranslationService
  }
}
