export const APP_SETTINGS_SCHEMA_VERSION = 1

export type AppPanelModePreference = 'playlist' | 'asr' | 'info'

export type AppSettings = {
  schemaVersion: number
  ui: {
    defaultPanelMode: AppPanelModePreference
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
      defaultPanelMode: 'playlist'
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
