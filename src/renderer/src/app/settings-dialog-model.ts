import { Camera, Captions, Clapperboard, Keyboard, LayoutGrid, Settings2 } from 'lucide-react'
import type {
  AppLocale,
  AppPanelModePreference,
  AppSettings,
  AppSettingsSectionId,
  AppSettingsSectionPatcher,
  CaptureFileNamingMode,
  CaptureGifResolution,
  CaptureImageFormat,
  SubtitleDisplayMode,
  SubtitleLanguageId,
  SubtitleLineHeight,
  SubtitleTargetLanguageId
} from '../../../shared/app-settings'
import type { AsrModelSourceId, AsrRuntimeStatus, AsrTranslationServiceTestResult } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { SettingsSelectOption } from './settings-controls'
import type { SettingsSectionProps } from './settings-section-types'

export type SettingsTab = {
  id: AppSettings['ui']['lastSettingsSectionId']
  label: string
  ariaLabel: string
  icon: typeof Settings2
}

export function getSettingsTabs(copy: LocaleCopy): SettingsTab[] {
  return [
    { id: 'general', label: copy.settingsDialog.tabs.general, ariaLabel: copy.settingsDialog.tabAria.general, icon: Settings2 },
    { id: 'interface', label: copy.settingsDialog.tabs.interface, ariaLabel: copy.settingsDialog.tabAria.interface, icon: LayoutGrid },
    { id: 'video', label: copy.settingsDialog.tabs.video, ariaLabel: copy.settingsDialog.tabAria.video, icon: Clapperboard },
    { id: 'subtitles', label: copy.settingsDialog.tabs.subtitles, ariaLabel: copy.settingsDialog.tabAria.subtitles, icon: Captions },
    { id: 'capture', label: copy.settingsDialog.tabs.capture, ariaLabel: copy.settingsDialog.tabAria.capture, icon: Camera },
    { id: 'shortcuts', label: copy.settingsDialog.tabs.shortcuts, ariaLabel: copy.settingsDialog.tabAria.shortcuts, icon: Keyboard }
  ]
}

type SettingsSectionPropsInput = {
  copy: LocaleCopy
  settings: AppSettings
  activeSectionId: AppSettingsSectionId
  patchSettingsSection: AppSettingsSectionPatcher
  asrStatus: AsrRuntimeStatus | null
  translationServiceTestMessage: AsrTranslationServiceTestResult | null
  isTestingTranslationService: boolean
  onPickDefaultFolder: () => Promise<string | null>
  onPickCaptureFolder: () => Promise<string | null>
  onTestTranslationService: () => void
}

export function createSettingsSectionProps(input: SettingsSectionPropsInput): SettingsSectionProps {
  const { copy, settings, patchSettingsSection } = input
  const subtitleLanguageOptions: Array<SettingsSelectOption<SubtitleLanguageId>> = Object.entries(
    copy.subtitleLanguageOptions
  ).map(([languageId, option]) => ({ value: languageId as SubtitleLanguageId, label: option.label }))
  const targetLanguageOptions = subtitleLanguageOptions.filter(
    (option): option is SettingsSelectOption<SubtitleTargetLanguageId> => option.value !== 'auto'
  )

  return {
    ...input,
    activeSectionId: input.activeSectionId,
    languageOptions: Object.entries(copy.languageOptions).map(([locale, option]) => ({
      value: locale as AppLocale,
      label: option.label
    })),
    subtitleLanguageOptions,
    targetLanguageOptions,
    aiAutomationModeOptions: (['cache-only', 'ask', 'guide', 'complete'] as const).map((value) => ({
      value,
      label: copy.settingsDialog.subtitles.aiAutomationOptions[value]
    })),
    subtitleLineHeightOptions: Object.entries(copy.subtitleDisplay.lineHeightOptions).map(([value, label]) => ({
      value: value as SubtitleLineHeight,
      label
    })),
    subtitleDisplayModeOptions: Object.entries(copy.subtitleDisplay.displayModeOptions).map(([value, label]) => ({
      value: value as SubtitleDisplayMode,
      label
    })),
    startupPanelOptions: [
      { value: 'playlist' as AppPanelModePreference, label: copy.panels.playlistTitle },
      { value: 'asr' as AppPanelModePreference, label: copy.panels.asrTitle },
      { value: 'info' as AppPanelModePreference, label: copy.panels.infoTitle }
    ],
    modelSourceOptions: (['modelscope', 'huggingface'] as const).map((value) => ({
      value,
      label: copy.modelSources[value].title,
      description: copy.modelSources[value].description
    })),
    captureImageFormatOptions: (['jpg', 'png'] as const).map((value) => ({
      value,
      label: copy.settingsDialog.capture.formats[value]
    })),
    captureFileNamingOptions: (['sequential', 'timestamp'] as const).map((value) => ({
      value,
      label: copy.settingsDialog.capture.namingOptions[value]
    })),
    captureGifResolutionOptions: (['360p', '480p', '720p'] as const).map((value) => ({
      value,
      label: copy.settingsDialog.capture.resolutionOptions[value]
    })),
    translationServiceSourceLanguageLabel: input.translationServiceTestMessage?.sourceLanguage
      ? copy.subtitleLanguageOptions[input.translationServiceTestMessage.sourceLanguage as SubtitleLanguageId]?.label ??
        input.translationServiceTestMessage.sourceLanguage
      : '—',
    translationServiceTargetLanguageLabel: input.translationServiceTestMessage?.targetLanguage
      ? copy.subtitleLanguageOptions[input.translationServiceTestMessage.targetLanguage as SubtitleLanguageId]?.label ??
        input.translationServiceTestMessage.targetLanguage
      : '—',
    translationServiceEndpointSummary: input.translationServiceTestMessage?.translationBaseUrlSummary || '—'
  }
}
