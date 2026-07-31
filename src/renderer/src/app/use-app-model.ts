import { useState } from 'react'
import { createDefaultAppSettings, type AppSettings } from '../../../shared/app-settings'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrRuntimeStatus,
  AsrSubtitleCheckpointResult,
  AsrSubtitleResult,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryMode,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestResult,
  MediaProbeMetadata
} from '../../../shared/media-types'
import { initialPlayerState } from './player-state'
import type { AppModel, AsrNotice, EditingClipPreview, EditingProjectStatus } from './app-types'
import { useAppRefs } from './use-app-refs'
import type { EditingProject } from '../../../shared/editing-types'
export function useAppModel(): AppModel {
  const refs = useAppRefs()
  const [state, setState] = useState(initialPlayerState)
  const [viewMode, setViewMode] = useState<'video' | 'image'>('video')
  const [asrStatus, setAsrStatus] = useState<AsrRuntimeStatus | null>(null)
  const [asrCheckpoint, setAsrCheckpoint] = useState<AsrSubtitleCheckpointResult | null>(null)
  const [asrProgress, setAsrProgress] = useState<AsrJobProgress | null>(null)
  const [subtitleResult, setSubtitleResult] = useState<AsrSubtitleResult | null>(null)
  const [translatedSubtitleResult, setTranslatedSubtitleResult] = useState<AsrSubtitleTranslationResult | null>(null)
  const [subtitleSummaryResult, setSubtitleSummaryResult] = useState<AsrSubtitleSummaryResult | null>(null)
  const [summaryMode, setSummaryMode] = useState<AsrSubtitleSummaryMode>('quick')
  const [asrNotice, setAsrNotice] = useState<AsrNotice | null>(null)
  const [summaryNotice, setSummaryNotice] = useState<AsrNotice | null>(null)
  const [activeSubtitle, setActiveSubtitle] = useState<AsrSubtitleResult | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<AsrModelDownloadProgress | null>(null)
  const [isAsrBusy, setIsAsrBusy] = useState(false)
  const [asrElapsedMs, setAsrElapsedMs] = useState<number | null>(null)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [isDetectingWhisperBinary, setIsDetectingWhisperBinary] = useState(false)
  const [isSelectingWhisperBinary, setIsSelectingWhisperBinary] = useState(false)
  const [isClipExportDialogOpen, setIsClipExportDialogOpen] = useState(false)
  const [isExportingClip, setIsExportingClip] = useState(false)
  const [isTranslatingSubtitle, setIsTranslatingSubtitle] = useState(false)
  const [translationElapsedMs, setTranslationElapsedMs] = useState<number | null>(null)
  const [isSummarizingSubtitle, setIsSummarizingSubtitle] = useState(false)
  const [summaryElapsedMs, setSummaryElapsedMs] = useState<number | null>(null)
  const [isMediaDetailsDialogOpen, setIsMediaDetailsDialogOpen] = useState(false)
  const [runtimeSetupMessage, setRuntimeSetupMessage] = useState<{ success: boolean; message: string } | null>(null)
  const [translationServiceTestMessage, setTranslationServiceTestMessage] = useState<AsrTranslationServiceTestResult | null>(null)
  const [isTestingTranslationService, setIsTestingTranslationService] = useState(false)
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false)
  const [appSettings, setAppSettings] = useState<AppSettings>(createDefaultAppSettings())
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isControlDeckVisible, setIsControlDeckVisible] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [mediaMetadata, setMediaMetadata] = useState<MediaProbeMetadata | null>(null)
  const [isEditingMode, setIsEditingMode] = useState(false)
  const [editingProject, setEditingProject] = useState<EditingProject | null>(null)
  const [editingPast, setEditingPast] = useState<EditingProject[]>([])
  const [editingFuture, setEditingFuture] = useState<EditingProject[]>([])
  const [editingCurrentTime, setEditingCurrentTime] = useState(0)
  const [editingSelectedClipId, setEditingSelectedClipId] = useState<string | null>(null); const [editingSelectedCaptionId, setEditingSelectedCaptionId] = useState<string | null>(null); const [editingSelectedGraphicId, setEditingSelectedGraphicId] = useState<string | null>(null); const [editingSelectedVideoBlockId, setEditingSelectedVideoBlockId] = useState<string | null>(null)
  const [editingSourceFiles, setEditingSourceFiles] = useState<Record<string, import('../../../shared/media-types').MediaFile>>({})
  const [editingPreviewSourceId, setEditingPreviewSourceId] = useState<string | null>(null)
  const [editingClipPreview, setEditingClipPreview] = useState<EditingClipPreview | null>(null)
  const [isAddingEditingMedia, setIsAddingEditingMedia] = useState(false)
  const [isDetectingEditingScenes, setIsDetectingEditingScenes] = useState(false); const [isDetectingEditingSilence, setIsDetectingEditingSilence] = useState(false)
  const [editingProjectFilePath, setEditingProjectFilePath] = useState<string | null>(null); const [editingProjectStatus, setEditingProjectStatus] = useState<EditingProjectStatus | null>(null)
  return {
    ...refs,
    state,
    viewMode,
    setViewMode,
    setState,
    asrStatus, setAsrStatus,
    asrCheckpoint, setAsrCheckpoint, asrProgress, setAsrProgress,
    subtitleResult,
    setSubtitleResult,
    translatedSubtitleResult,
    setTranslatedSubtitleResult,
    subtitleSummaryResult,
    setSubtitleSummaryResult,
    summaryMode,
    setSummaryMode,
    asrNotice,
    setAsrNotice,
    summaryNotice,
    setSummaryNotice,
    activeSubtitle,
    setActiveSubtitle,
    downloadProgress,
    setDownloadProgress,
    isAsrBusy,
    setIsAsrBusy,
    asrElapsedMs,
    setAsrElapsedMs,
    isDownloadingModel,
    setIsDownloadingModel,
    isDetectingWhisperBinary,
    setIsDetectingWhisperBinary,
    isSelectingWhisperBinary,
    setIsSelectingWhisperBinary,
    isClipExportDialogOpen,
    setIsClipExportDialogOpen,
    isExportingClip,
    setIsExportingClip,
    isTranslatingSubtitle,
    setIsTranslatingSubtitle,
    translationElapsedMs,
    setTranslationElapsedMs,
    isSummarizingSubtitle,
    setIsSummarizingSubtitle,
    summaryElapsedMs,
    setSummaryElapsedMs,
    isMediaDetailsDialogOpen,
    setIsMediaDetailsDialogOpen,
    runtimeSetupMessage,
    setRuntimeSetupMessage,
    translationServiceTestMessage,
    setTranslationServiceTestMessage,
    isTestingTranslationService,
    setIsTestingTranslationService,
    isDownloadDialogOpen,
    setIsDownloadDialogOpen,
    appSettings,
    setAppSettings,
    isSettingsDialogOpen,
    setIsSettingsDialogOpen,
    isControlDeckVisible,
    setIsControlDeckVisible,
    isFullscreen,
    setIsFullscreen,
    mediaMetadata,
    setMediaMetadata,
    isEditingMode,
    setIsEditingMode,
    editingProject,
    setEditingProject,
    editingPast,
    setEditingPast,
    editingFuture,
    setEditingFuture,
    editingCurrentTime, setEditingCurrentTime,
    editingSelectedClipId, setEditingSelectedClipId, editingSelectedCaptionId, setEditingSelectedCaptionId, editingSelectedGraphicId, setEditingSelectedGraphicId, editingSelectedVideoBlockId, setEditingSelectedVideoBlockId,
    editingSourceFiles, setEditingSourceFiles,
    editingPreviewSourceId, setEditingPreviewSourceId,
    editingClipPreview, setEditingClipPreview,
    isAddingEditingMedia, setIsAddingEditingMedia,
    isDetectingEditingScenes, setIsDetectingEditingScenes, isDetectingEditingSilence, setIsDetectingEditingSilence,
    editingProjectFilePath, setEditingProjectFilePath,
    editingProjectStatus, setEditingProjectStatus
  }
}
