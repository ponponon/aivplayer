import type { MutableRefObject } from 'react'
import type {
  AsrErrorDetails,
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrRuntimeStatus,
  AsrSubtitleResult,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryMode,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestResult,
  MediaProbeMetadata
} from '../../../shared/media-types'
import type { PanelMode, PlayerState } from './player-state'

export type AsrNotice = {
  success: boolean
  message: string
  errorDetails?: AsrErrorDetails
}

export type AppRefs = {
  videoRef: MutableRefObject<HTMLVideoElement | null>
  subtitleActionsRef: MutableRefObject<HTMLDetailsElement | null>
  subtitleDisplayControlsRef: MutableRefObject<HTMLDetailsElement | null>
  downloadDialogRef: MutableRefObject<HTMLElement | null>
  videoClickTimerRef: MutableRefObject<number | null>
  holdRightArrowTimerRef: MutableRefObject<number | null>
  holdRightArrowRestoreRateRef: MutableRefObject<number | null>
  controlDeckHideTimerRef: MutableRefObject<number | null>
  asrStartedAtRef: MutableRefObject<number | null>
  translationStartedAtRef: MutableRefObject<number | null>
  summaryStartedAtRef: MutableRefObject<number | null>
  playbackEndedRef: MutableRefObject<boolean>
  lastSavedProgressRef: MutableRefObject<{ path: string | null; time: number }>
}

export type AppStateSetters = {
  setState: React.Dispatch<React.SetStateAction<PlayerState>>
  setAsrStatus: React.Dispatch<React.SetStateAction<AsrRuntimeStatus | null>>
  setAsrProgress: React.Dispatch<React.SetStateAction<AsrJobProgress | null>>
  setSubtitleResult: React.Dispatch<React.SetStateAction<AsrSubtitleResult | null>>
  setTranslatedSubtitleResult: React.Dispatch<React.SetStateAction<AsrSubtitleTranslationResult | null>>
  setSubtitleSummaryResult: React.Dispatch<React.SetStateAction<AsrSubtitleSummaryResult | null>>
  setSummaryMode: React.Dispatch<React.SetStateAction<AsrSubtitleSummaryMode>>
  setAsrNotice: React.Dispatch<React.SetStateAction<AsrNotice | null>>
  setSummaryNotice: React.Dispatch<React.SetStateAction<AsrNotice | null>>
  setActiveSubtitle: React.Dispatch<React.SetStateAction<AsrSubtitleResult | null>>
  setDownloadProgress: React.Dispatch<React.SetStateAction<AsrModelDownloadProgress | null>>
  setIsAsrBusy: React.Dispatch<React.SetStateAction<boolean>>
  setAsrElapsedMs: React.Dispatch<React.SetStateAction<number | null>>
  setIsDownloadingModel: React.Dispatch<React.SetStateAction<boolean>>
  setIsDetectingWhisperBinary: React.Dispatch<React.SetStateAction<boolean>>
  setIsSelectingWhisperBinary: React.Dispatch<React.SetStateAction<boolean>>
  setIsClipExportDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsExportingClip: React.Dispatch<React.SetStateAction<boolean>>
  setIsTranslatingSubtitle: React.Dispatch<React.SetStateAction<boolean>>
  setTranslationElapsedMs: React.Dispatch<React.SetStateAction<number | null>>
  setIsSummarizingSubtitle: React.Dispatch<React.SetStateAction<boolean>>
  setSummaryElapsedMs: React.Dispatch<React.SetStateAction<number | null>>
  setIsMediaDetailsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setRuntimeSetupMessage: React.Dispatch<React.SetStateAction<{ success: boolean; message: string } | null>>
  setTranslationServiceTestMessage: React.Dispatch<React.SetStateAction<AsrTranslationServiceTestResult | null>>
  setIsTestingTranslationService: React.Dispatch<React.SetStateAction<boolean>>
  setIsDownloadDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setAppSettings: React.Dispatch<React.SetStateAction<import('../../../shared/app-settings').AppSettings>>
  setIsSettingsDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setIsControlDeckVisible: React.Dispatch<React.SetStateAction<boolean>>
  setIsFullscreen: React.Dispatch<React.SetStateAction<boolean>>
  setMediaMetadata: React.Dispatch<React.SetStateAction<MediaProbeMetadata | null>>
  setViewMode: React.Dispatch<React.SetStateAction<'video' | 'image'>>
}

export type AppModel = AppRefs &
  AppStateSetters & {
    state: PlayerState
  viewMode: 'video' | 'image'
    asrStatus: AsrRuntimeStatus | null
    asrProgress: AsrJobProgress | null
    subtitleResult: AsrSubtitleResult | null
    translatedSubtitleResult: AsrSubtitleTranslationResult | null
    subtitleSummaryResult: AsrSubtitleSummaryResult | null
    summaryMode: AsrSubtitleSummaryMode
    asrNotice: AsrNotice | null
    summaryNotice: AsrNotice | null
    activeSubtitle: AsrSubtitleResult | null
    downloadProgress: AsrModelDownloadProgress | null
    isAsrBusy: boolean
    asrElapsedMs: number | null
    isDownloadingModel: boolean
    isDetectingWhisperBinary: boolean
    isSelectingWhisperBinary: boolean
    isClipExportDialogOpen: boolean
    isExportingClip: boolean
    isTranslatingSubtitle: boolean
    translationElapsedMs: number | null
    isSummarizingSubtitle: boolean
    summaryElapsedMs: number | null
    isMediaDetailsDialogOpen: boolean
    runtimeSetupMessage: { success: boolean; message: string } | null
    translationServiceTestMessage: AsrTranslationServiceTestResult | null
    isTestingTranslationService: boolean
    isDownloadDialogOpen: boolean
    appSettings: import('../../../shared/app-settings').AppSettings
    isSettingsDialogOpen: boolean
    isControlDeckVisible: boolean
    isFullscreen: boolean
    mediaMetadata: MediaProbeMetadata | null
  }

export type PanelActions = {
  togglePanelMode: (panelMode: PanelMode) => void
  openPanelMode: (panelMode: Exclude<PanelMode, 'none'>) => void
}
