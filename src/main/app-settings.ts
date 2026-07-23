import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'
import {
  APP_SETTINGS_SCHEMA_VERSION,
  createDefaultAppSettings,
  normalizeTranslationGlossary,
  type CaptureFileNamingMode,
  type CaptureGifResolution,
  type CaptureImageFormat,
  type AppPanelModePreference,
  type AppSettingsSectionId,
  type AppSettings,
  type AiAutomationMode,
  type SubtitleDisplayMode,
  type SubtitleLineHeight,
  type SubtitleTargetLanguageId
} from '../shared/app-settings'
import { isClipExportLengthSeconds, isClipExportMode } from '../shared/clip-export'
import type { AsrModelSourceId } from '../shared/media-types'
import { isAppLocale, isSubtitleLanguageId } from '../shared/localization'
import { MAX_PLAYBACK_HISTORY_ITEMS, type PlaybackHistoryEntry } from '../shared/playback-history'

export type AppSettingsSecretCodec = {
  encryptString: (value: string) => string
  decryptString: (value: string) => string
}

const APP_SETTINGS_SECRET_PREFIX = 'safe:'
let appSettingsSecretCodecPromise: Promise<AppSettingsSecretCodec | null> | null = null

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

function isSubtitleLineHeight(value: unknown): value is SubtitleLineHeight {
  return value === 'compact' || value === 'normal' || value === 'relaxed'
}

function isSubtitleDisplayMode(value: unknown): value is SubtitleDisplayMode {
  return value === 'source' || value === 'translation' || value === 'bilingual'
}

function isSubtitleTargetLanguageId(value: unknown): value is SubtitleTargetLanguageId {
  return isSubtitleLanguageId(value) && value !== 'auto'
}

function isAiAutomationMode(value: unknown): value is AiAutomationMode {
  return value === 'cache-only' || value === 'ask' || value === 'guide' || value === 'complete'
}

async function resolveAppSettingsSecretCodec(): Promise<AppSettingsSecretCodec | null> {
  if (!appSettingsSecretCodecPromise) {
    appSettingsSecretCodecPromise = (async () => {
      try {
        const { safeStorage } = await import('electron')

        if (!safeStorage.isEncryptionAvailable()) {
          return null
        }

        return {
          encryptString: (value: string) => safeStorage.encryptString(value).toString('base64'),
          decryptString: (value: string) => safeStorage.decryptString(Buffer.from(value, 'base64'))
        }
      } catch {
        return null
      }
    })()
  }

  return appSettingsSecretCodecPromise
}

export function resetAppSettingsSecretCodecCache(): void {
  appSettingsSecretCodecPromise = null
}

function normalizeTextField(value: unknown, fallback: string | null): string | null {
  if (typeof value !== 'string') {
    return fallback
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : fallback
}

function encodeSecretValue(value: string | null | undefined, codec: AppSettingsSecretCodec | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (!codec) {
    return value
  }

  return `${APP_SETTINGS_SECRET_PREFIX}${codec.encryptString(value)}`
}

function decodeSecretValue(value: unknown, codec: AppSettingsSecretCodec | null): string | null {
  if (typeof value !== 'string' || value.length === 0) {
    return null
  }

  if (!value.startsWith(APP_SETTINGS_SECRET_PREFIX)) {
    return value
  }

  if (!codec) {
    return null
  }

  try {
    return codec.decryptString(value.slice(APP_SETTINGS_SECRET_PREFIX.length))
  } catch {
    return null
  }
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

function sanitizePlaybackHistory(value: unknown, fallback: PlaybackHistoryEntry[]): PlaybackHistoryEntry[] {
  if (!Array.isArray(value)) {
    return fallback
  }

  const seen = new Set<string>()
  return value
    .filter((entry): entry is Partial<PlaybackHistoryEntry> => Boolean(entry) && typeof entry === 'object')
    .map((entry) => ({
      path: typeof entry.path === 'string' ? entry.path : '',
      name: typeof entry.name === 'string' ? entry.name.trim() : '',
      extension: typeof entry.extension === 'string' ? entry.extension.trim().toLowerCase() : '',
      lastPlayedAt: typeof entry.lastPlayedAt === 'number' ? entry.lastPlayedAt : 0,
      durationSeconds: isFiniteNumber(entry.durationSeconds) && entry.durationSeconds > 0 ? entry.durationSeconds : null
    }))
    .filter((entry) => {
      if (seen.has(entry.path)) return false
      if (!entry.path || !isAbsolute(entry.path) || !entry.name || !isFiniteNumber(entry.lastPlayedAt) || entry.lastPlayedAt <= 0) return false
      seen.add(entry.path)
      return true
    })
    .sort((left, right) => right.lastPlayedAt - left.lastPlayedAt)
    .slice(0, MAX_PLAYBACK_HISTORY_ITEMS)
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
    lastProgressByPath: sanitizePlaybackProgressByPath(playback.lastProgressByPath, defaults.lastProgressByPath),
    history: sanitizePlaybackHistory(playback.history, defaults.history)
  }
}

function sanitizeSubtitleSettings(
  value: Partial<AppSettings['subtitles']> | undefined,
  defaults: AppSettings['subtitles']
): AppSettings['subtitles'] {
  const subtitles = value ?? {}
  const fontSizePx =
    typeof subtitles.fontSizePx === 'number' && Number.isFinite(subtitles.fontSizePx)
      ? Math.min(28, Math.max(12, Math.round(subtitles.fontSizePx)))
      : defaults.fontSizePx

  return {
    fontSizePx,
    lineHeight: isSubtitleLineHeight(subtitles.lineHeight) ? subtitles.lineHeight : defaults.lineHeight,
    displayMode: isSubtitleDisplayMode(subtitles.displayMode) ? subtitles.displayMode : defaults.displayMode,
    targetLanguage: isSubtitleTargetLanguageId(subtitles.targetLanguage)
      ? subtitles.targetLanguage
      : defaults.targetLanguage
  }
}

function sanitizeAiSettings(
  value: Partial<AppSettings['ai']> | undefined,
  defaults: AppSettings['ai']
): AppSettings['ai'] {
  const ai = value ?? {}

  return {
    openMode: isAiAutomationMode(ai.openMode) ? ai.openMode : defaults.openMode
  }
}

function sanitizeVisionSettings(
  value: Partial<AppSettings['vision']> | undefined,
  defaults: AppSettings['vision']
): AppSettings['vision'] {
  const vision = value ?? {}
  if (!Array.isArray(vision.libraryDirectories)) return defaults

  const directories: string[] = []
  for (const rawPath of vision.libraryDirectories) {
    if (typeof rawPath !== 'string') continue
    const directoryPath = rawPath.trim()
    if (!directoryPath || directoryPath.length > 4096 || !isAbsolute(directoryPath) || directories.includes(directoryPath)) continue
    directories.push(directoryPath)
    if (directories.length >= 50) break
  }
  return { libraryDirectories: directories }
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
      typeof asr.autoLoadCachedSubtitles === 'boolean' ? asr.autoLoadCachedSubtitles : defaults.autoLoadCachedSubtitles,
    translationBaseUrl: normalizeTextField(asr.translationBaseUrl, defaults.translationBaseUrl),
    translationModel: normalizeTextField(asr.translationModel, defaults.translationModel),
    translationApiKey: normalizeTextField(asr.translationApiKey, defaults.translationApiKey),
    translationGlossary: normalizeTranslationGlossary(asr.translationGlossary) ?? defaults.translationGlossary
  }
}

function encodeAppSettingsForDisk(settings: AppSettings, secretCodec: AppSettingsSecretCodec | null): AppSettings {
  return {
    ...settings,
    asr: {
      ...settings.asr,
      translationApiKey: encodeSecretValue(settings.asr.translationApiKey, secretCodec)
    }
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
    subtitles?: Partial<AppSettings['subtitles']>
    ai?: Partial<AppSettings['ai']>
    vision?: Partial<AppSettings['vision']>
    asr?: Partial<AppSettings['asr']>
  }

  const legacyPlayback = typeof value.schemaVersion !== 'number' || value.schemaVersion < 12
  const playback = legacyPlayback
    ? {
        ...value.playback,
        singleClickPause: true
      }
    : value.playback

  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: sanitizeUiSettings(value.ui, defaults.ui),
    media: sanitizeMediaSettings(value.media, defaults.media),
    capture: sanitizeCaptureSettings(value.capture, defaults.capture, captureDefaultDirectoryPath),
    playback: sanitizePlaybackSettings(playback, defaults.playback),
    subtitles: sanitizeSubtitleSettings(value.subtitles, defaults.subtitles),
    ai: sanitizeAiSettings(value.ai, defaults.ai),
    vision: sanitizeVisionSettings(value.vision, defaults.vision),
    asr: sanitizeAsrSettings(value.asr, defaults.asr)
  }
}

export async function readAppSettings(
  userDataPath: string,
  captureDefaultDirectoryPath: string | null = null,
  secretCodec: AppSettingsSecretCodec | null = null
): Promise<AppSettings> {
  try {
    const content = await readFile(getAppSettingsPath(userDataPath), 'utf-8')
    const parsed = JSON.parse(content) as Partial<AppSettings> & {
      asr?: Partial<AppSettings['asr']> & {
        translationApiKey?: unknown
      }
    }

    if (
      parsed.asr &&
      typeof parsed.asr.translationApiKey === 'string' &&
      parsed.asr.translationApiKey.startsWith(APP_SETTINGS_SECRET_PREFIX)
    ) {
      parsed.asr = {
        ...parsed.asr,
        translationApiKey: decodeSecretValue(parsed.asr.translationApiKey, secretCodec ?? (await resolveAppSettingsSecretCodec()))
      }
    }

    return sanitizeAppSettings(parsed as unknown, captureDefaultDirectoryPath)
  } catch {
    return sanitizeAppSettings(null, captureDefaultDirectoryPath)
  }
}

export async function writeAppSettings(
  userDataPath: string,
  settings: AppSettings,
  captureDefaultDirectoryPath: string | null = null,
  secretCodec: AppSettingsSecretCodec | null = null
): Promise<AppSettings> {
  const nextSettings = sanitizeAppSettings(settings, captureDefaultDirectoryPath)
  const settingsPath = getAppSettingsPath(userDataPath)
  const codec =
    typeof nextSettings.asr.translationApiKey === 'string' && nextSettings.asr.translationApiKey.length > 0
      ? secretCodec ?? (await resolveAppSettingsSecretCodec())
      : secretCodec
  const diskSettings = encodeAppSettingsForDisk(nextSettings, codec)

  await mkdir(dirname(settingsPath), { recursive: true })
  await writeFile(settingsPath, `${JSON.stringify(diskSettings, null, 2)}\n`)

  return nextSettings
}
