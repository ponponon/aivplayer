import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  APP_SETTINGS_SCHEMA_VERSION,
  createDefaultAppSettings,
  type AppPanelModePreference,
  type AppSettingsSectionId,
  type AppSettings
} from '../shared/app-settings'
import type { AsrModelSourceId } from '../shared/media-types'

function getAppSettingsPath(userDataPath: string): string {
  return join(userDataPath, 'app-settings.json')
}

function isPanelModePreference(value: unknown): value is AppPanelModePreference {
  return value === 'playlist' || value === 'asr' || value === 'info'
}

function isSettingsSectionId(value: unknown): value is AppSettingsSectionId {
  return value === 'startup' || value === 'playback' || value === 'asr'
}

function isAsrModelSourceId(value: unknown): value is AsrModelSourceId {
  return value === 'modelscope' || value === 'huggingface'
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
    asr?: Partial<AppSettings['asr']>
    playback?: Partial<AppSettings['playback']>
  }

  const ui = (value.ui ?? {}) as Partial<AppSettings['ui']>
  const asr = (value.asr ?? {}) as Partial<AppSettings['asr']>
  const playback = (value.playback ?? {}) as Partial<AppSettings['playback']>

  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: {
      defaultPanelMode: isPanelModePreference(ui.defaultPanelMode) ? ui.defaultPanelMode : defaults.ui.defaultPanelMode,
      lastSettingsSectionId: isSettingsSectionId(ui.lastSettingsSectionId)
        ? ui.lastSettingsSectionId
        : defaults.ui.lastSettingsSectionId
    },
    asr: {
      preferredModelSourceId: isAsrModelSourceId(asr.preferredModelSourceId)
        ? asr.preferredModelSourceId
        : defaults.asr.preferredModelSourceId
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
