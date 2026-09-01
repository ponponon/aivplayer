import type {
  AppLocale,
  AppThemePreference,
  AiAutomationMode,
  AppSettings,
  AppSettingsSectionId,
  AppSettingsSectionPatcher,
  CaptureFileNamingMode,
  CaptureGifResolution,
  CaptureImageFormat,
  ManagedTranslationRouteMode,
  SubtitleDisplayMode,
  SubtitleLanguageId,
  SubtitleLineHeight,
  SubtitleTargetLanguageId
} from '../../../shared/app-settings'
import type { AsrCacheStats, AsrModelSourceId, AsrRuntimeStatus, AsrTranslationServiceTestRequest, AsrTranslationServiceTestResult } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { SettingsSelectOption } from './settings-controls'

export type SettingsSectionActiveId = AppSettingsSectionId | 'about'

export type SettingsSectionProps = {
  copy: LocaleCopy
  settings: AppSettings
  patchSettingsSection: AppSettingsSectionPatcher
  activeSectionId: SettingsSectionActiveId
  languageOptions: ReadonlyArray<SettingsSelectOption<AppLocale>>
  themeOptions: ReadonlyArray<SettingsSelectOption<AppThemePreference>>
  subtitleLanguageOptions: ReadonlyArray<SettingsSelectOption<SubtitleLanguageId>>
  targetLanguageOptions: ReadonlyArray<SettingsSelectOption<SubtitleTargetLanguageId>>
  aiAutomationModeOptions: ReadonlyArray<SettingsSelectOption<AiAutomationMode>>
  managedTranslationRouteModeOptions: ReadonlyArray<SettingsSelectOption<ManagedTranslationRouteMode>>
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
  cacheStats: AsrCacheStats | null
  cacheStatus: { success: boolean; message: string } | null
  isLoadingCacheStats: boolean
  isClearingCache: boolean
  onPickDefaultFolder: () => Promise<string | null>
  onPickCaptureFolder: () => Promise<string | null>
  onTestTranslationService: (provider?: AsrTranslationServiceTestRequest['provider']) => void
  onRefreshCacheStats: () => void
  onClearStaleCache: () => void
  onGpuAccelerationChange?: (enabled: boolean) => void
}
