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

function normalizeSettingsSectionId(value: unknown): AppSettingsSectionId {
  if (value === 'startup') {
    return 'general'
  }

  if (value === 'playback') {
    return 'interface'
  }

  if (value === 'asr') {
    return 'subtitles'
  }

  return isSettingsSectionId(value) ? value : createDefaultAppSettings().ui.lastSettingsSectionId
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

function sanitizeAppSettings(parsed: unknown, captureDefaultDirectoryPath: string | null = null): AppSettings {
  const defaults = createDefaultAppSettings()

  if (!parsed || typeof parsed !== 'object') {
    return {
      ...defaults,
      capture: {
        ...defaults.capture,
        saveDirectoryPath: captureDefaultDirectoryPath
      }
    }
  }

  const value = parsed as Partial<AppSettings> & {
    ui?: Partial<AppSettings['ui']>
    media?: Partial<AppSettings['media']>
    capture?: Partial<AppSettings['capture']>
    playback?: Partial<AppSettings['playback']>
    asr?: Partial<AppSettings['asr']>
  }

  const ui = (value.ui ?? {}) as Partial<AppSettings['ui']>
  const media = (value.media ?? {}) as Partial<AppSettings['media']>
  const capture = (value.capture ?? {}) as Partial<AppSettings['capture']>
  const playback = (value.playback ?? {}) as Partial<AppSettings['playback']>
  const asr = (value.asr ?? {}) as Partial<AppSettings['asr']>

  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: {
      locale: isAppLocale(ui.locale) ? ui.locale : defaults.ui.locale,
      defaultPanelMode: isPanelModePreference(ui.defaultPanelMode) ? ui.defaultPanelMode : defaults.ui.defaultPanelMode,
      lastSettingsSectionId: normalizeSettingsSectionId(ui.lastSettingsSectionId)
    },
    media: {
      defaultOpenDirectoryPath:
        typeof media.defaultOpenDirectoryPath === 'string' &&
        media.defaultOpenDirectoryPath.length > 0 &&
        isAbsolute(media.defaultOpenDirectoryPath) &&
        existsSync(media.defaultOpenDirectoryPath)
          ? media.defaultOpenDirectoryPath
          : defaults.media.defaultOpenDirectoryPath,
      autoLoadSameDirectoryFiles:
        typeof media.autoLoadSameDirectoryFiles === 'boolean'
          ? media.autoLoadSameDirectoryFiles
          : defaults.media.autoLoadSameDirectoryFiles
    },
    capture: {
      saveDirectoryPath: normalizeCaptureSaveDirectoryPath(capture.saveDirectoryPath, captureDefaultDirectoryPath),
      copyToClipboard:
        typeof capture.copyToClipboard === 'boolean' ? capture.copyToClipboard : defaults.capture.copyToClipboard,
      imageFormat: isCaptureImageFormat(capture.imageFormat) ? capture.imageFormat : defaults.capture.imageFormat,
      fileNaming: isCaptureFileNamingMode(capture.fileNaming) ? capture.fileNaming : defaults.capture.fileNaming,
      gifFrameRate:
        typeof capture.gifFrameRate === 'number' && Number.isFinite(capture.gifFrameRate) && capture.gifFrameRate > 0
          ? Math.min(60, capture.gifFrameRate)
          : defaults.capture.gifFrameRate,
      gifResolution:
        isCaptureGifResolution(capture.gifResolution) ? capture.gifResolution : defaults.capture.gifResolution,
      clipExportLengthSeconds:
        isClipExportLengthSeconds(capture.clipExportLengthSeconds)
          ? capture.clipExportLengthSeconds
          : defaults.capture.clipExportLengthSeconds,
      clipExportMode:
        isClipExportMode(capture.clipExportMode) ? capture.clipExportMode : defaults.capture.clipExportMode
    },
    playback: {
      rememberVolume:
        typeof playback.rememberVolume === 'boolean' ? playback.rememberVolume : defaults.playback.rememberVolume,
      rememberPlaybackRate:
        typeof playback.rememberPlaybackRate === 'boolean'
          ? playback.rememberPlaybackRate
          : defaults.playback.rememberPlaybackRate,
      rememberProgress:
        typeof playback.rememberProgress === 'boolean'
          ? playback.rememberProgress
          : defaults.playback.rememberProgress,
      autoHideControlDeck:
        typeof playback.autoHideControlDeck === 'boolean'
          ? playback.autoHideControlDeck
          : defaults.playback.autoHideControlDeck,
      controlDeckAutoHideSeconds:
        typeof playback.controlDeckAutoHideSeconds === 'number' &&
        Number.isFinite(playback.controlDeckAutoHideSeconds) &&
        playback.controlDeckAutoHideSeconds > 0
          ? Math.min(60, Math.max(1, Math.round(playback.controlDeckAutoHideSeconds)))
          : defaults.playback.controlDeckAutoHideSeconds,
      showTotalPlaybackTime:
        typeof playback.showTotalPlaybackTime === 'boolean'
          ? playback.showTotalPlaybackTime
          : defaults.playback.showTotalPlaybackTime,
      seekStepSeconds:
        typeof playback.seekStepSeconds === 'number' && Number.isFinite(playback.seekStepSeconds) && playback.seekStepSeconds > 0
          ? Math.min(120, playback.seekStepSeconds)
          : defaults.playback.seekStepSeconds,
      singleClickPause:
        typeof playback.singleClickPause === 'boolean' ? playback.singleClickPause : defaults.playback.singleClickPause,
      pauseWhenMinimized:
        typeof playback.pauseWhenMinimized === 'boolean'
          ? playback.pauseWhenMinimized
          : defaults.playback.pauseWhenMinimized,
      holdRightArrowSpeed:
        typeof playback.holdRightArrowSpeed === 'number' &&
        Number.isFinite(playback.holdRightArrowSpeed) &&
        playback.holdRightArrowSpeed > 0
          ? Math.min(16, playback.holdRightArrowSpeed)
          : defaults.playback.holdRightArrowSpeed,
      lastVolume: isFiniteNumber(playback.lastVolume)
        ? Math.min(1, Math.max(0, playback.lastVolume))
        : defaults.playback.lastVolume,
      lastMuted: typeof playback.lastMuted === 'boolean' ? playback.lastMuted : defaults.playback.lastMuted,
      lastPlaybackRate:
        isFiniteNumber(playback.lastPlaybackRate) && playback.lastPlaybackRate > 0
          ? Math.min(16, playback.lastPlaybackRate)
          : defaults.playback.lastPlaybackRate,
      lastProgressByPath:
        playback.lastProgressByPath && typeof playback.lastProgressByPath === 'object'
          ? Object.fromEntries(
              Object.entries(playback.lastProgressByPath)
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
                .map(([path, currentTime]) => [path, currentTime])
            )
          : defaults.playback.lastProgressByPath
    },
    asr: {
      preferredModelSourceId: isAsrModelSourceId(asr.preferredModelSourceId)
        ? asr.preferredModelSourceId
        : defaults.asr.preferredModelSourceId,
      defaultSubtitleLanguage: isSubtitleLanguageId(asr.defaultSubtitleLanguage)
        ? asr.defaultSubtitleLanguage
        : defaults.asr.defaultSubtitleLanguage,
      autoLoadCachedSubtitles:
        typeof asr.autoLoadCachedSubtitles === 'boolean'
          ? asr.autoLoadCachedSubtitles
          : defaults.asr.autoLoadCachedSubtitles
    }
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
