import type { AsrModelSourceId } from './media-types'
import type { ClipExportLengthSeconds, ClipExportMode } from './clip-export'
import { DEFAULT_APP_LOCALE, DEFAULT_SUBTITLE_LANGUAGE, type AppLocale, type SubtitleLanguageId } from './localization'

export const APP_SETTINGS_SCHEMA_VERSION = 8

export type CaptureImageFormat = 'jpg' | 'png'
export type CaptureFileNamingMode = 'sequential' | 'timestamp'
export type CaptureGifResolution = '360p' | '480p' | '720p'

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
  asr: {
    preferredModelSourceId: AsrModelSourceId
    defaultSubtitleLanguage: SubtitleLanguageId
    autoLoadCachedSubtitles: boolean
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
    asr: {
      preferredModelSourceId: 'modelscope',
      defaultSubtitleLanguage: DEFAULT_SUBTITLE_LANGUAGE,
      autoLoadCachedSubtitles: true
    }
  }
}
