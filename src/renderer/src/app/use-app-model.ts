import { useState } from 'react'
import { createDefaultAppSettings, type AppSettings } from '../../../shared/app-settings'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrRuntimeStatus,
  AsrSubtitleResult,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestResult,
  MediaProbeMetadata
} from '../../../shared/media-types'
import { initialPlayerState } from './player-state'
import type { AppModel, AsrNotice } from './app-types'
import { useAppRefs } from './use-app-refs'

export function useAppModel(): AppModel {
  const refs = useAppRefs()
  const [state, setState] = useState(initialPlayerState)
  const [asrStatus, setAsrStatus] = useState<AsrRuntimeStatus | null>(null)
  const [asrProgress, setAsrProgress] = useState<AsrJobProgress | null>(null)
  const [subtitleResult, setSubtitleResult] = useState<AsrSubtitleResult | null>(null)
  const [translatedSubtitleResult, setTranslatedSubtitleResult] = useState<AsrSubtitleTranslationResult | null>(null)
  const [subtitleSummaryResult, setSubtitleSummaryResult] = useState<AsrSubtitleSummaryResult | null>(null)
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

  return {
    ...refs,
    state,
    setState,
    asrStatus,
    setAsrStatus,
    asrProgress,
    setAsrProgress,
    subtitleResult,
    setSubtitleResult,
    translatedSubtitleResult,
    setTranslatedSubtitleResult,
    subtitleSummaryResult,
    setSubtitleSummaryResult,
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
    setMediaMetadata
  }
}
