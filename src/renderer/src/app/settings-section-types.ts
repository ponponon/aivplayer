import type {
  AppLocale,
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

export type SettingsSectionProps = {
  copy: LocaleCopy
  settings: AppSettings
  patchSettingsSection: AppSettingsSectionPatcher
  activeSectionId: AppSettingsSectionId
  languageOptions: ReadonlyArray<SettingsSelectOption<AppLocale>>
  subtitleLanguageOptions: ReadonlyArray<SettingsSelectOption<SubtitleLanguageId>>
  targetLanguageOptions: ReadonlyArray<SettingsSelectOption<SubtitleTargetLanguageId>>
  subtitleLineHeightOptions: ReadonlyArray<SettingsSelectOption<SubtitleLineHeight>>
  subtitleDisplayModeOptions: ReadonlyArray<SettingsSelectOption<SubtitleDisplayMode>>
  startupPanelOptions: ReadonlyArray<{ value: AppSettings['ui']['defaultPanelMode']; label: string }>
  modelSourceOptions: ReadonlyArray<{ value: AsrModelSourceId; label: string; description: string }>
  captureImageFormatOptions: ReadonlyArray<SettingsSelectOption<CaptureImageFormat>>
  captureFileNamingOptions: ReadonlyArray<SettingsSelectOption<CaptureFileNamingMode>>
  captureGifResolutionOptions: ReadonlyArray<SettingsSelectOption<CaptureGifResolution>>
  asrStatus: AsrRuntimeStatus | null
  translationServiceTestMessage: AsrTranslationServiceTestResult | null
  isTestingTranslationService: boolean
  translationServiceSourceLanguageLabel: string
  translationServiceTargetLanguageLabel: string
  translationServiceEndpointSummary: string
  onPickDefaultFolder: () => Promise<string | null>
  onPickCaptureFolder: () => Promise<string | null>
  onTestTranslationService: () => void
}
