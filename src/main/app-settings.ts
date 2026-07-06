import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import {
  APP_SETTINGS_SCHEMA_VERSION,
  createDefaultAppSettings,
  type CaptureFileNamingMode,
  type CaptureGifResolution,
  type CaptureImageFormat,
  type AppPanelModePreference,
  type AppSettingsSectionId,
  type AppSettings
} from '../shared/app-settings'
import { isClipExportLengthSeconds, isClipExportMode } from '../shared/clip-export'
import type { AsrModelSourceId } from '../shared/media-types'
import { isAppLocale, isSubtitleLanguageId } from '../shared/localization'

function getAppSettingsPath(userDataPath: string): string {
  return join(userDataPath, 'app-settings.json')
}

function isPanelModePreference(value: unknown): value is AppPanelModePreference {
  return value === 'playlist' || value === 'asr' || value === 'info'
}

function isSettingsSectionId(value: unknown): value is AppSettingsSectionId {
  return value === 'general' || value === 'interface' || value === 'video' || value === 'subtitles' || value === 'capture' || value === 'shortcuts'
}

function isAsrModelSourceId(value: unknown): value is AsrModelSourceId {
  return value === 'modelscope' || value === 'huggingface'
}

function isCaptureImageFormat(value: unknown): value is CaptureImageFormat {
  return value === 'jpg' || value === 'png'
}

function isCaptureFileNamingMode(value: unknown): value is CaptureFileNamingMode {
  return value === 'sequential' || value === 'timestamp'
}

function isCaptureGifResolution(value: unknown): value is CaptureGifResolution {
  return value === '360p' || value === '480p' || value === '720p'
}

function normalizeSettingsSectionId(value: unknown, fallback: AppSettingsSectionId): AppSettingsSectionId {
  if (value === 'startup') {
    return 'general'
  }

  if (value === 'playback') {
    return 'interface'
  }

  if (value === 'asr') {
    return 'subtitles'
  }

  return isSettingsSectionId(value) ? value : fallback
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function normalizeCaptureSaveDirectoryPath(value: unknown, fallbackPath: string | null): string | null {
  if (typeof value === 'string' && value.length > 0 && isAbsolute(value) && existsSync(value)) {
    return value
  }

  return fallbackPath
}

function sanitizeUiSettings(
  value: Partial<AppSettings['ui']> | undefined,
  defaults: AppSettings['ui']
): AppSettings['ui'] {
  const ui = value ?? {}

  return {
    locale: isAppLocale(ui.locale) ? ui.locale : defaults.locale,
    defaultPanelMode: isPanelModePreference(ui.defaultPanelMode) ? ui.defaultPanelMode : defaults.defaultPanelMode,
    lastSettingsSectionId: normalizeSettingsSectionId(ui.lastSettingsSectionId, defaults.lastSettingsSectionId)
  }
}

function sanitizeMediaSettings(
  value: Partial<AppSettings['media']> | undefined,
  defaults: AppSettings['media']
): AppSettings['media'] {
  const media = value ?? {}

  return {
    defaultOpenDirectoryPath:
      typeof media.defaultOpenDirectoryPath === 'string' &&
      media.defaultOpenDirectoryPath.length > 0 &&
      isAbsolute(media.defaultOpenDirectoryPath) &&
      existsSync(media.defaultOpenDirectoryPath)
        ? media.defaultOpenDirectoryPath
        : defaults.defaultOpenDirectoryPath,
    autoLoadSameDirectoryFiles:
      typeof media.autoLoadSameDirectoryFiles === 'boolean'
        ? media.autoLoadSameDirectoryFiles
        : defaults.autoLoadSameDirectoryFiles
  }
}

function sanitizeCaptureSettings(
  value: Partial<AppSettings['capture']> | undefined,
  defaults: AppSettings['capture'],
  captureDefaultDirectoryPath: string | null
): AppSettings['capture'] {
  const capture = value ?? {}

  return {
    saveDirectoryPath: normalizeCaptureSaveDirectoryPath(capture.saveDirectoryPath, captureDefaultDirectoryPath),
    copyToClipboard: typeof capture.copyToClipboard === 'boolean' ? capture.copyToClipboard : defaults.copyToClipboard,
    imageFormat: isCaptureImageFormat(capture.imageFormat) ? capture.imageFormat : defaults.imageFormat,
    fileNaming: isCaptureFileNamingMode(capture.fileNaming) ? capture.fileNaming : defaults.fileNaming,
    gifFrameRate:
      typeof capture.gifFrameRate === 'number' && Number.isFinite(capture.gifFrameRate) && capture.gifFrameRate > 0
        ? Math.min(60, capture.gifFrameRate)
        : defaults.gifFrameRate,
    gifResolution: isCaptureGifResolution(capture.gifResolution) ? capture.gifResolution : defaults.gifResolution,
    clipExportLengthSeconds:
      isClipExportLengthSeconds(capture.clipExportLengthSeconds)
        ? capture.clipExportLengthSeconds
        : defaults.clipExportLengthSeconds,
    clipExportMode: isClipExportMode(capture.clipExportMode) ? capture.clipExportMode : defaults.clipExportMode
  }
}

function sanitizePlaybackProgressByPath(
  value: unknown,
  fallback: Record<string, number>
): Record<string, number> {
  if (!value || typeof value !== 'object') {
    return fallback
  }

  const sanitizedEntries: Array<[string, number]> = Object.entries(value as Record<string, unknown>)
    .filter(([path, currentTime]) => {
      return (
        typeof path === 'string' &&
        path.length > 0 &&
        isAbsolute(path) &&
        typeof currentTime === 'number' &&
        Number.isFinite(currentTime) &&
        currentTime >= 0
      )
    })
    .slice(0, 100)
    .map(([path, currentTime]) => [path, currentTime] as [string, number])

  return Object.fromEntries(sanitizedEntries)
}

function sanitizePlaybackSettings(
  value: Partial<AppSettings['playback']> | undefined,
  defaults: AppSettings['playback']
): AppSettings['playback'] {
  const playback = value ?? {}

  return {
    rememberVolume: typeof playback.rememberVolume === 'boolean' ? playback.rememberVolume : defaults.rememberVolume,
    rememberPlaybackRate:
      typeof playback.rememberPlaybackRate === 'boolean'
        ? playback.rememberPlaybackRate
        : defaults.rememberPlaybackRate,
    rememberProgress: typeof playback.rememberProgress === 'boolean' ? playback.rememberProgress : defaults.rememberProgress,
    autoHideControlDeck:
      typeof playback.autoHideControlDeck === 'boolean' ? playback.autoHideControlDeck : defaults.autoHideControlDeck,
    controlDeckAutoHideSeconds:
      typeof playback.controlDeckAutoHideSeconds === 'number' &&
      Number.isFinite(playback.controlDeckAutoHideSeconds) &&
      playback.controlDeckAutoHideSeconds > 0
        ? Math.min(60, Math.max(1, Math.round(playback.controlDeckAutoHideSeconds)))
        : defaults.controlDeckAutoHideSeconds,
    showTotalPlaybackTime:
      typeof playback.showTotalPlaybackTime === 'boolean'
        ? playback.showTotalPlaybackTime
        : defaults.showTotalPlaybackTime,
    seekStepSeconds:
      typeof playback.seekStepSeconds === 'number' && Number.isFinite(playback.seekStepSeconds) && playback.seekStepSeconds > 0
        ? Math.min(120, playback.seekStepSeconds)
        : defaults.seekStepSeconds,
    singleClickPause: typeof playback.singleClickPause === 'boolean' ? playback.singleClickPause : defaults.singleClickPause,
    pauseWhenMinimized:
      typeof playback.pauseWhenMinimized === 'boolean' ? playback.pauseWhenMinimized : defaults.pauseWhenMinimized,
    holdRightArrowSpeed:
      typeof playback.holdRightArrowSpeed === 'number' &&
      Number.isFinite(playback.holdRightArrowSpeed) &&
      playback.holdRightArrowSpeed > 0
        ? Math.min(16, playback.holdRightArrowSpeed)
        : defaults.holdRightArrowSpeed,
    lastVolume: isFiniteNumber(playback.lastVolume) ? Math.min(1, Math.max(0, playback.lastVolume)) : defaults.lastVolume,
    lastMuted: typeof playback.lastMuted === 'boolean' ? playback.lastMuted : defaults.lastMuted,
    lastPlaybackRate:
      isFiniteNumber(playback.lastPlaybackRate) && playback.lastPlaybackRate > 0
        ? Math.min(16, playback.lastPlaybackRate)
        : defaults.lastPlaybackRate,
    lastProgressByPath: sanitizePlaybackProgressByPath(playback.lastProgressByPath, defaults.lastProgressByPath)
  }
}

function sanitizeAsrSettings(
  value: Partial<AppSettings['asr']> | undefined,
  defaults: AppSettings['asr']
): AppSettings['asr'] {
  const asr = value ?? {}

  return {
    preferredModelSourceId: isAsrModelSourceId(asr.preferredModelSourceId)
      ? asr.preferredModelSourceId
      : defaults.preferredModelSourceId,
    defaultSubtitleLanguage: isSubtitleLanguageId(asr.defaultSubtitleLanguage)
      ? asr.defaultSubtitleLanguage
      : defaults.defaultSubtitleLanguage,
    autoLoadCachedSubtitles:
      typeof asr.autoLoadCachedSubtitles === 'boolean' ? asr.autoLoadCachedSubtitles : defaults.autoLoadCachedSubtitles
  }
}

function sanitizeAppSettings(parsed: unknown, captureDefaultDirectoryPath: string | null = null): AppSettings {
  const defaults = createDefaultAppSettings()

  if (!parsed || typeof parsed !== 'object') {
    return {
      ...defaults,
      capture: sanitizeCaptureSettings(undefined, defaults.capture, captureDefaultDirectoryPath)
    }
  }

  const value = parsed as Partial<AppSettings> & {
    ui?: Partial<AppSettings['ui']>
    media?: Partial<AppSettings['media']>
    capture?: Partial<AppSettings['capture']>
    playback?: Partial<AppSettings['playback']>
    asr?: Partial<AppSettings['asr']>
  }

  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: sanitizeUiSettings(value.ui, defaults.ui),
    media: sanitizeMediaSettings(value.media, defaults.media),
    capture: sanitizeCaptureSettings(value.capture, defaults.capture, captureDefaultDirectoryPath),
    playback: sanitizePlaybackSettings(value.playback, defaults.playback),
    asr: sanitizeAsrSettings(value.asr, defaults.asr)
  }
}

export async function readAppSettings(
  userDataPath: string,
  captureDefaultDirectoryPath: string | null = null
): Promise<AppSettings> {
  try {
    const content = await readFile(getAppSettingsPath(userDataPath), 'utf-8')
    return sanitizeAppSettings(JSON.parse(content) as unknown, captureDefaultDirectoryPath)
  } catch {
    return sanitizeAppSettings(null, captureDefaultDirectoryPath)
  }
}

export async function writeAppSettings(
  userDataPath: string,
  settings: AppSettings,
  captureDefaultDirectoryPath: string | null = null
): Promise<AppSettings> {
  const nextSettings = sanitizeAppSettings(settings, captureDefaultDirectoryPath)
  const settingsPath = getAppSettingsPath(userDataPath)

  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`)

  return nextSettings
}
