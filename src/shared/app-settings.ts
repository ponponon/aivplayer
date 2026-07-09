import type { AsrModelSourceId } from './media-types'
import type { ClipExportLengthSeconds, ClipExportMode } from './clip-export'
import { DEFAULT_APP_LOCALE, DEFAULT_SUBTITLE_LANGUAGE, type AppLocale, type SubtitleLanguageId } from './localization'

export const APP_SETTINGS_SCHEMA_VERSION = 9

export type CaptureImageFormat = 'jpg' | 'png'
export type CaptureFileNamingMode = 'sequential' | 'timestamp'
export type CaptureGifResolution = '360p' | '480p' | '720p'
export type SubtitleDisplayMode = 'source' | 'translation' | 'bilingual'
export type SubtitleLineHeight = 'compact' | 'normal' | 'relaxed'
export type SubtitleTargetLanguageId = Exclude<SubtitleLanguageId, 'auto'>

export type AppPanelModePreference = 'playlist' | 'asr' | 'info'
export type AppSettingsSectionId = 'general' | 'interface' | 'video' | 'subtitles' | 'capture' | 'shortcuts'

export type { AppLocale, SubtitleLanguageId } from './localization'

export type AppSettings = {
  schemaVersion: number
  ui: {
    locale: AppLocale
    defaultPanelMode: AppPanelModePreference
    lastSettingsSectionId: AppSettingsSectionId
  }
  media: {
    defaultOpenDirectoryPath: string | null
    autoLoadSameDirectoryFiles: boolean
  }
  capture: {
    saveDirectoryPath: string | null
    copyToClipboard: boolean
    imageFormat: CaptureImageFormat
    fileNaming: CaptureFileNamingMode
    gifFrameRate: number
    gifResolution: CaptureGifResolution
    clipExportLengthSeconds: ClipExportLengthSeconds
    clipExportMode: ClipExportMode
  }
  playback: {
    rememberVolume: boolean
    rememberPlaybackRate: boolean
    rememberProgress: boolean
    autoHideControlDeck: boolean
    controlDeckAutoHideSeconds: number
    showTotalPlaybackTime: boolean
    seekStepSeconds: number
    singleClickPause: boolean
    pauseWhenMinimized: boolean
    holdRightArrowSpeed: number
    lastVolume: number
    lastMuted: boolean
    lastPlaybackRate: number
    lastProgressByPath: Record<string, number>
  }
  subtitles: {
    fontSizePx: number
    lineHeight: SubtitleLineHeight
    displayMode: SubtitleDisplayMode
    targetLanguage: SubtitleTargetLanguageId
  }
  asr: {
    preferredModelSourceId: AsrModelSourceId
    defaultSubtitleLanguage: SubtitleLanguageId
    autoLoadCachedSubtitles: boolean
  }
}

export type AppSettingsSectionKey = Exclude<keyof AppSettings, 'schemaVersion'>
export type AppSettingsSectionUpdate<TSection extends AppSettingsSectionKey> =
  | Partial<AppSettings[TSection]>
  | ((currentSection: AppSettings[TSection]) => AppSettings[TSection])
export type AppSettingsSectionPatcher = <TSection extends AppSettingsSectionKey>(
  section: TSection,
  patchOrUpdater: AppSettingsSectionUpdate<TSection>
) => void

export function updateAppSettingsSection<TSection extends AppSettingsSectionKey>(
  current: AppSettings,
  section: TSection,
  patchOrUpdater: AppSettingsSectionUpdate<TSection>
): AppSettings {
  const nextSection =
    typeof patchOrUpdater === 'function'
      ? patchOrUpdater(current[section])
      : {
          ...current[section],
          ...patchOrUpdater
        }

  return {
    ...current,
    [section]: nextSection
  }
}

export function createAppSettingsSectionPatcher(
  onChange: (updater: (current: AppSettings) => AppSettings) => void
): AppSettingsSectionPatcher {
  return (section, patchOrUpdater) => {
    onChange((current) => updateAppSettingsSection(current, section, patchOrUpdater))
  }
}

export function createDefaultAppSettings(): AppSettings {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: {
      locale: DEFAULT_APP_LOCALE,
      defaultPanelMode: 'playlist',
      lastSettingsSectionId: 'general'
    },
    media: {
      defaultOpenDirectoryPath: null,
      autoLoadSameDirectoryFiles: false
    },
    capture: {
      saveDirectoryPath: null,
      copyToClipboard: true,
      imageFormat: 'jpg',
      fileNaming: 'sequential',
      gifFrameRate: 10,
      gifResolution: '360p',
      clipExportLengthSeconds: 30,
      clipExportMode: 'video'
    },
    playback: {
      rememberVolume: true,
      rememberPlaybackRate: true,
      rememberProgress: true,
      autoHideControlDeck: true,
      controlDeckAutoHideSeconds: 3,
      showTotalPlaybackTime: false,
      seekStepSeconds: 10,
      singleClickPause: false,
      pauseWhenMinimized: false,
      holdRightArrowSpeed: 4,
      lastVolume: 0.8,
      lastMuted: false,
      lastPlaybackRate: 1,
      lastProgressByPath: {}
    },
    subtitles: {
      fontSizePx: 14,
      lineHeight: 'normal',
      displayMode: 'source',
      targetLanguage: 'zh'
    },
    asr: {
      preferredModelSourceId: 'modelscope',
      defaultSubtitleLanguage: DEFAULT_SUBTITLE_LANGUAGE,
      autoLoadCachedSubtitles: true
    }
  }
}
