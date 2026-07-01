import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  APP_SETTINGS_SCHEMA_VERSION,
  createDefaultAppSettings,
  type AppPanelModePreference,
  type AppSettings
} from '../shared/app-settings'

function getAppSettingsPath(userDataPath: string): string {
  return join(userDataPath, 'app-settings.json')
}

function isPanelModePreference(value: unknown): value is AppPanelModePreference {
  return value === 'playlist' || value === 'asr' || value === 'info'
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function sanitizeAppSettings(parsed: unknown): AppSettings {
  const defaults = createDefaultAppSettings()

  if (!parsed || typeof parsed !== 'object') {
    return defaults
  }

  const value = parsed as Partial<AppSettings> & {
    ui?: Partial<AppSettings['ui']>
    playback?: Partial<AppSettings['playback']>
  }

  const ui = (value.ui ?? {}) as Partial<AppSettings['ui']>
  const playback = (value.playback ?? {}) as Partial<AppSettings['playback']>

  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: {
      defaultPanelMode: isPanelModePreference(ui.defaultPanelMode) ? ui.defaultPanelMode : defaults.ui.defaultPanelMode
    },
    playback: {
      rememberVolume: typeof playback.rememberVolume === 'boolean' ? playback.rememberVolume : defaults.playback.rememberVolume,
      rememberPlaybackRate:
        typeof playback.rememberPlaybackRate === 'boolean'
          ? playback.rememberPlaybackRate
          : defaults.playback.rememberPlaybackRate,
      lastVolume: isFiniteNumber(playback.lastVolume)
        ? Math.min(1, Math.max(0, playback.lastVolume))
        : defaults.playback.lastVolume,
      lastMuted: typeof playback.lastMuted === 'boolean' ? playback.lastMuted : defaults.playback.lastMuted,
      lastPlaybackRate: isFiniteNumber(playback.lastPlaybackRate) && playback.lastPlaybackRate > 0
        ? playback.lastPlaybackRate
        : defaults.playback.lastPlaybackRate
    }
  }
}

export async function readAppSettings(userDataPath: string): Promise<AppSettings> {
  try {
    const content = await readFile(getAppSettingsPath(userDataPath), 'utf-8')
    return sanitizeAppSettings(JSON.parse(content) as unknown)
  } catch {
    return createDefaultAppSettings()
  }
}

export async function writeAppSettings(userDataPath: string, settings: AppSettings): Promise<AppSettings> {
  const nextSettings = sanitizeAppSettings(settings)
  const settingsPath = getAppSettingsPath(userDataPath)

  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`)

  return nextSettings
}
