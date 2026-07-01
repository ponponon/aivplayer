import type { AsrModelSourceId } from './media-types'

export const APP_SETTINGS_SCHEMA_VERSION = 3

export type AppPanelModePreference = 'playlist' | 'asr' | 'info'
export type AppSettingsSectionId = 'startup' | 'playback' | 'asr'

export type AppSettings = {
  schemaVersion: number
  ui: {
    defaultPanelMode: AppPanelModePreference
    lastSettingsSectionId: AppSettingsSectionId
  }
  asr: {
    preferredModelSourceId: AsrModelSourceId
  }
  playback: {
    rememberVolume: boolean
    rememberPlaybackRate: boolean
    lastVolume: number
    lastMuted: boolean
    lastPlaybackRate: number
  }
}

export function createDefaultAppSettings(): AppSettings {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: {
      defaultPanelMode: 'playlist',
      lastSettingsSectionId: 'startup'
    },
    asr: {
      preferredModelSourceId: 'modelscope'
    },
    playback: {
      rememberVolume: true,
      rememberPlaybackRate: true,
      lastVolume: 0.8,
      lastMuted: false,
      lastPlaybackRate: 1
    }
  }
}
