import type { MutableRefObject } from 'react'
import type {
  AsrErrorDetails,
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrRuntimeStatus,
  AsrSubtitleCheckpointResult,
  AsrSubtitleResult,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryMode,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestResult,
  MediaFile,
  MediaProbeMetadata
} from '../../../shared/media-types'
import type { PanelMode, PlayerState } from './player-state'
import type { EditingClipFilter, EditingClipTreatment, EditingProject, EditingTreatmentAnchor } from '../../../shared/editing-types'
import type { WebShareStatus } from '../../../shared/web-types'

export type AsrNotice = {
  success: boolean
  message: string
  errorDetails?: AsrErrorDetails
}

export type EditingProjectStatus = {
  success: boolean
  message: string
  origin?: 'caption-candidates'
  details?: {
    label: string
    groups: Array<{
      id: string
      label: string
      items: string[]
    }>
  }
}

/**
 * Renderer-only clip styling draft. It is intentionally not part of
 * EditingProject so slider drags do not create history entries or write files.
 */
export type EditingClipPreview = {
  clipId: string
  filter?: EditingClipFilter
  treatment?: EditingClipTreatment
  treatmentScale?: number
  treatmentAnchor?: EditingTreatmentAnchor
  treatmentSize?: number
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
  editingResumePlaybackRef: MutableRefObject<boolean>
  editingBaseAudioRef: MutableRefObject<{ volume: number; muted: boolean } | null>
  lastSavedProgressRef: MutableRefObject<{ path: string | null; time: number }>
}

export type AppStateSetters = {
  setState: React.Dispatch<React.SetStateAction<PlayerState>>
  setAsrStatus: React.Dispatch<React.SetStateAction<AsrRuntimeStatus | null>>
  setAsrCheckpoint: React.Dispatch<React.SetStateAction<AsrSubtitleCheckpointResult | null>>
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
  setIsAboutDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
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
  setIsEditingMode: React.Dispatch<React.SetStateAction<boolean>>
  setEditingProject: React.Dispatch<React.SetStateAction<EditingProject | null>>
  setEditingPast: React.Dispatch<React.SetStateAction<EditingProject[]>>
  setEditingFuture: React.Dispatch<React.SetStateAction<EditingProject[]>>
  setEditingCurrentTime: React.Dispatch<React.SetStateAction<number>>
  setEditingSelectedClipId: React.Dispatch<React.SetStateAction<string | null>>
  setEditingSelectedCaptionId: React.Dispatch<React.SetStateAction<string | null>>
  setEditingSelectedGraphicId: React.Dispatch<React.SetStateAction<string | null>>
  setEditingSelectedVideoBlockId: React.Dispatch<React.SetStateAction<string | null>>
  setEditingSourceFiles: React.Dispatch<React.SetStateAction<Record<string, MediaFile>>>
  setEditingPreviewSourceId: React.Dispatch<React.SetStateAction<string | null>>
  setEditingClipPreview: React.Dispatch<React.SetStateAction<EditingClipPreview | null>>
  setIsAddingEditingMedia: React.Dispatch<React.SetStateAction<boolean>>
  setIsDetectingEditingScenes: React.Dispatch<React.SetStateAction<boolean>>
  setIsDetectingEditingSilence: React.Dispatch<React.SetStateAction<boolean>>
  setEditingProjectFilePath: React.Dispatch<React.SetStateAction<string | null>>
  setEditingProjectStatus: React.Dispatch<React.SetStateAction<EditingProjectStatus | null>>
  setWebShareStatus: React.Dispatch<React.SetStateAction<WebShareStatus>>
  setIsWebShareDialogOpen: React.Dispatch<React.SetStateAction<boolean>>
  setWebShareError: React.Dispatch<React.SetStateAction<string | null>>
  setWebShareNotice: React.Dispatch<React.SetStateAction<string | null>>
}

export type AppModel = AppRefs &
  AppStateSetters & {
    state: PlayerState
  viewMode: 'video' | 'image'
    asrStatus: AsrRuntimeStatus | null
    asrCheckpoint: AsrSubtitleCheckpointResult | null
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
    isAboutDialogOpen: boolean
    runtimeSetupMessage: { success: boolean; message: string } | null
    translationServiceTestMessage: AsrTranslationServiceTestResult | null
    isTestingTranslationService: boolean
    isDownloadDialogOpen: boolean
    appSettings: import('../../../shared/app-settings').AppSettings
    isSettingsDialogOpen: boolean
    isControlDeckVisible: boolean
    isFullscreen: boolean
    mediaMetadata: MediaProbeMetadata | null
    isEditingMode: boolean
    editingProject: EditingProject | null
    editingPast: EditingProject[]
    editingFuture: EditingProject[]
    editingCurrentTime: number
    editingSelectedClipId: string | null
    editingSelectedCaptionId: string | null
    editingSelectedGraphicId: string | null
    editingSelectedVideoBlockId: string | null
    editingSourceFiles: Record<string, MediaFile>
    editingPreviewSourceId: string | null
    editingClipPreview: EditingClipPreview | null
    isAddingEditingMedia: boolean
    isDetectingEditingScenes: boolean
    isDetectingEditingSilence: boolean
    editingProjectFilePath: string | null
    editingProjectStatus: EditingProjectStatus | null
    webShareStatus: WebShareStatus
    isWebShareDialogOpen: boolean
    webShareError: string | null
    webShareNotice: string | null
  }

export type PanelActions = {
  togglePanelMode: (panelMode: PanelMode) => void
  openPanelMode: (panelMode: Exclude<PanelMode, 'none'>) => void
}
