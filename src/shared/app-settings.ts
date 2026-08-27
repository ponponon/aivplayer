import type { AsrModelSourceId } from './media-types'
import type { ClipExportLengthSeconds, ClipExportMode } from './clip-export'
import type { PlaybackHistoryEntry } from './playback-history'
import { DEFAULT_APP_LOCALE, DEFAULT_SUBTITLE_LANGUAGE, type AppLocale, type SubtitleLanguageId } from './localization'
import type { SubtitleEmphasisMode, SubtitlePresetId } from './subtitle-presets'
import type { PlaybackBookmark, PlaybackEndAction, PlaybackMediaProfile, PlaybackOrder, PlaybackRepeatMode, PlaybackSegment } from './playback-memory'
import type { MediaStructureCorrection } from './media-base-types'
import type { DramaGenerationMediaType } from './drama-types'
import { MANAGED_AI_PROVIDER_ID, createManagedAiProvider, type AiProviderProfile } from './ai-providers'

export const APP_SETTINGS_SCHEMA_VERSION = 30

export const SIDE_PANEL_WIDTH_MIN = 240
export const SIDE_PANEL_WIDTH_MAX = 480
export const SIDE_PANEL_WIDTH_DEFAULT = 280

export type CaptureImageFormat = 'jpg' | 'png'
export type CaptureFileNamingMode = 'sequential' | 'timestamp'
export type CaptureGifResolution = '360p' | '480p' | '720p'
export type SubtitleDisplayMode = 'source' | 'translation' | 'bilingual'
export type SubtitleLineHeight = 'compact' | 'normal' | 'relaxed'
export type SubtitleTargetLanguageId = Exclude<SubtitleLanguageId, 'auto'>
export type AiAutomationMode = 'cache-only' | 'ask' | 'guide' | 'complete'
export type AppThemePreference = 'system' | 'light' | 'dark'

export type AppPanelModePreference = 'playlist' | 'asr' | 'info'
export type AppSettingsSectionId = 'general' | 'ai' | 'interface' | 'video' | 'subtitles' | 'capture' | 'shortcuts'

export type { AppLocale, SubtitleLanguageId } from './localization'

export type AppSettings = {
  schemaVersion: number
  ui: {
    locale: AppLocale
    theme: AppThemePreference
    defaultPanelMode: AppPanelModePreference
    lastSettingsSectionId: AppSettingsSectionId
    sidePanelWidth: number
    autoUpdate: boolean
  }
  media: {
    defaultOpenDirectoryPath: string | null
    autoLoadSameDirectoryFiles: boolean
    importInboxDirectories: string[]
    importInboxWriteSidecars: boolean
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
    gpuAcceleration: boolean
    endAction: PlaybackEndAction
    repeatMode: PlaybackRepeatMode
    order: PlaybackOrder
    lastVolume: number
    lastMuted: boolean
    lastPlaybackRate: number
    lastProgressByPath: Record<string, number>
    profilesByFingerprint: Record<string, PlaybackMediaProfile>
    bookmarksByFingerprint: Record<string, PlaybackBookmark[]>
    segmentsByFingerprint: Record<string, PlaybackSegment[]>
    structureCorrectionsByFingerprint: Record<string, MediaStructureCorrection[]>
    history: PlaybackHistoryEntry[]
  }
  subtitles: {
    fontSizePx: number
    lineHeight: SubtitleLineHeight
    displayMode: SubtitleDisplayMode
    targetLanguage: SubtitleTargetLanguageId
    presetId: SubtitlePresetId
    emphasisMode: SubtitleEmphasisMode
    keywords: string
  }
  ai: {
    openMode: AiAutomationMode
    providers: AiProviderProfile[]
    activeProviderId: string
  }
  vision: {
    libraryDirectories: string[]
    speakerModelDirectory: string | null
    objectDetectionModelDirectory: string | null
  }
  drama: {
    apiBaseUrl: string | null
    model: string | null
    apiKey: string | null
    useMock: boolean
    media: Record<DramaGenerationMediaType, DramaMediaProviderConfig>
  }
  asr: {
    preferredModelSourceId: AsrModelSourceId
    defaultSubtitleLanguage: SubtitleLanguageId
    autoLoadCachedSubtitles: boolean
    translationGlossary: string | null
  }
  tts: {
    executablePath: string | null
    voice: string | null
  }
}

export type DramaMediaProviderConfig = {
  providerId: string | null
  apiBaseUrl: string | null
  model: string | null
  apiKey: string | null
  costPerRequest: number | null
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

export function normalizeTranslationGlossary(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null
  }

  const lines: string[] = []
  let length = 0

  for (const rawLine of value.split(/\r?\n/)) {
    const separatorIndex = rawLine.indexOf('=')
    if (separatorIndex <= 0) {
      continue
    }

    const source = rawLine.slice(0, separatorIndex).trim()
    const target = rawLine.slice(separatorIndex + 1).trim()
    if (!source || !target) {
      continue
    }

    const normalizedLine = `${source}=${target}`
    const nextLength = length + normalizedLine.length + (lines.length > 0 ? 1 : 0)
    if (nextLength > 4096) {
      break
    }

    lines.push(normalizedLine)
    length = nextLength
  }

  return lines.length > 0 ? lines.join('\n') : null
}

export function normalizeSidePanelWidth(value: unknown, fallback = SIDE_PANEL_WIDTH_DEFAULT): number {
  const width = typeof value === 'number' && Number.isFinite(value) ? value : fallback
  return Math.min(SIDE_PANEL_WIDTH_MAX, Math.max(SIDE_PANEL_WIDTH_MIN, Math.round(width)))
}

export function createDefaultAppSettings(): AppSettings {
  return {
    schemaVersion: APP_SETTINGS_SCHEMA_VERSION,
    ui: {
      locale: DEFAULT_APP_LOCALE,
      theme: 'dark',
      defaultPanelMode: 'playlist',
      lastSettingsSectionId: 'general',
      sidePanelWidth: SIDE_PANEL_WIDTH_DEFAULT,
      autoUpdate: true
    },
    media: {
      defaultOpenDirectoryPath: null,
      autoLoadSameDirectoryFiles: false,
      importInboxDirectories: [],
      importInboxWriteSidecars: true
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
      singleClickPause: true,
      pauseWhenMinimized: false,
      holdRightArrowSpeed: 4,
      gpuAcceleration: true,
      endAction: 'next',
      repeatMode: 'none',
      order: 'normal',
      lastVolume: 0.8,
      lastMuted: false,
      lastPlaybackRate: 1,
      lastProgressByPath: {},
      profilesByFingerprint: {},
      bookmarksByFingerprint: {},
      segmentsByFingerprint: {},
      structureCorrectionsByFingerprint: {},
      history: []
    },
    subtitles: {
      fontSizePx: 14,
      lineHeight: 'normal',
      displayMode: 'source',
      targetLanguage: 'zh',
      presetId: 'clean',
      emphasisMode: 'words',
      keywords: ''
    },
    ai: {
      openMode: 'cache-only',
      providers: [createManagedAiProvider()],
      activeProviderId: MANAGED_AI_PROVIDER_ID
    },
    vision: {
      libraryDirectories: [],
      speakerModelDirectory: null,
      objectDetectionModelDirectory: null
    },
    drama: {
      apiBaseUrl: null,
      model: null,
      apiKey: null,
      useMock: false,
      media: {
        image: createDefaultDramaMediaProviderConfig(),
        video: createDefaultDramaMediaProviderConfig(),
        audio: createDefaultDramaMediaProviderConfig()
      }
    },
    asr: {
      preferredModelSourceId: 'r2',
      defaultSubtitleLanguage: DEFAULT_SUBTITLE_LANGUAGE,
      autoLoadCachedSubtitles: true,
      translationGlossary: null
    },
    tts: {
      executablePath: null,
      voice: null
    }
  }
}

function createDefaultDramaMediaProviderConfig(): DramaMediaProviderConfig {
  return {
    providerId: null,
    apiBaseUrl: null,
    model: null,
    apiKey: null,
    costPerRequest: null
  }
}
