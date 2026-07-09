import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type ReactElement } from 'react'
import {
  AudioLines,
  Captions,
  Clock,
  CloudDownload,
  ChevronDown,
  Copy,
  Download,
  FileText,
  FolderOpen,
  Info,
  Languages,
  ListVideo,
  Maximize2,
  PanelRight,
  Pause,
  Play,
  RefreshCcw,
  Settings,
  SkipBack,
  SkipForward,
  Square,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import { SubtitleOverlay } from '../subtitle-overlay'
import {
  createDefaultAppSettings,
  createAppSettingsSectionPatcher,
  type AppSettings,
  type AppSettingsSectionPatcher,
  type AppSettingsSectionId
} from '../../../shared/app-settings'
import type { ClipExportLengthSeconds, ClipExportMode } from '../../../shared/clip-export'
import { getAppCopy, type LocaleCopy } from '../../../shared/i18n'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelSourceId,
  AsrRuntimeStatus,
  MediaClipExportRequest,
  AsrSubtitleTranslationResult,
  AsrSubtitleResult,
  MediaFile,
  MediaProbeMetadata
} from '../../../shared/media-types'
import { initialPlayerState, type PanelMode, type PlayerState } from './player-state'
import { buildAsrModelViewState } from './asr-model-view-state'
import { ClipExportDialog } from './clip-export-dialog'
import { InfoValue } from './info-value'
import { MediaDetailsDialog } from './media-details-dialog'
import { SettingsDialog } from './settings-dialog'
import { useModalFocusTrap } from './use-modal-focus-trap'
import { clamp, formatPlaybackTimeLabel, formatTime } from '../lib/time'
import { resolvePlaybackStartTime } from './playback-progress'

type AsrNotice = {
  success: boolean
  message: string
}

function getPlayFailureMessage(copy: LocaleCopy, error: unknown): string | null {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return null
  }

  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return copy.runtime.playbackStartFailed(message)
}

function getMediaErrorMessage(copy: LocaleCopy, video: HTMLVideoElement): string | null {
  const error = video.error

  if (!error) {
    return null
  }

  if (error.code === MediaError.MEDIA_ERR_ABORTED) {
    return null
  }

  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return copy.runtime.mediaReadFailed(error.message || copy.runtime.mediaReadFallback)
  }

  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return copy.runtime.videoDecodeFailed(error.message || copy.runtime.videoDecodeFallback)
  }

  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return copy.runtime.mediaSourceNotSupported(error.message || copy.runtime.mediaSourceNotSupportedFallback)
  }

  return copy.runtime.playbackFailed(error.message || copy.runtime.unknownMediaError(error.code))
}

function mergePlaylist(current: MediaFile[], incoming: MediaFile[]): MediaFile[] {
  const seen = new Set(current.map((item) => item.path))
  const additions = incoming.filter((item) => !seen.has(item.path))
  return [...current, ...additions]
}

function getPlaylistFileByPath(playlist: MediaFile[], file: MediaFile): MediaFile {
  return playlist.find((item) => item.path === file.path) ?? file
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) {
    return `${Math.round(bytes / 1024)} KB`
  }

  return `${Math.round(bytes / 1024 / 1024)} MB`
}

const MEDIA_CODEC_LABELS: Record<string, string> = {
  aac: 'AAC',
  av1: 'AV1',
  avc1: 'H.264',
  flac: 'FLAC',
  h264: 'H.264',
  h265: 'HEVC',
  hevc: 'HEVC',
  mp3: 'MP3',
  mpeg4: 'MPEG-4',
  opus: 'Opus',
  prores: 'ProRes',
  vorbis: 'Vorbis',
  vp9: 'VP9'
}

function getGreatestCommonDivisor(left: number, right: number): number {
  let a = Math.abs(left)
  let b = Math.abs(right)

  while (b !== 0) {
    const next = b
    b = a % b
    a = next
  }

  return a || 1
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return '--'
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  const sizeInMb = bytes / (1024 * 1024)
  return sizeInMb >= 10 ? `${sizeInMb.toFixed(1)} MB` : `${sizeInMb.toFixed(2)} MB`
}

function formatBitrate(kbps: number | null | undefined): string {
  if (kbps == null || !Number.isFinite(kbps) || kbps < 0) {
    return '--'
  }

  return `${Math.round(kbps)} kb/s`
}

function formatFrameRate(frameRate: number | null | undefined): string {
  if (frameRate == null || !Number.isFinite(frameRate) || frameRate <= 0) {
    return '--'
  }

  const rounded = Math.round(frameRate * 100) / 100
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(2)} FPS`
}

function formatResolution(width: number | null | undefined, height: number | null | undefined): string {
  if (width == null || height == null || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '--'
  }

  return `${Math.round(width)} × ${Math.round(height)}`
}

function formatAspectRatio(
  width: number | null | undefined,
  height: number | null | undefined,
  displayAspectRatio: string | null | undefined
): string {
  if (displayAspectRatio) {
    return displayAspectRatio
  }

  if (width == null || height == null || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return '--'
  }

  const divisor = getGreatestCommonDivisor(Math.round(width), Math.round(height))
  return `${Math.round(width) / divisor}:${Math.round(height) / divisor}`
}

function formatCodecLabel(codec: string | null | undefined, profile: string | null | undefined): string {
  if (!codec) {
    return '--'
  }

  const normalizedCodec = MEDIA_CODEC_LABELS[codec.toLowerCase()] ?? codec.replace(/_/g, ' ').toUpperCase()
  return profile ? `${normalizedCodec} / ${profile}` : normalizedCodec
}

function formatChannelLayout(channelLayout: string | null | undefined): string {
  if (!channelLayout) {
    return '--'
  }

  return channelLayout.replace(/^([a-z])/, (_, firstLetter: string) => firstLetter.toUpperCase())
}

function formatSampleRate(sampleRateHz: number | null | undefined): string {
  if (sampleRateHz == null || !Number.isFinite(sampleRateHz) || sampleRateHz <= 0) {
    return '--'
  }

  if (sampleRateHz >= 1000) {
    const kilohertz = sampleRateHz / 1000
    return `${Number.isInteger(kilohertz) ? kilohertz.toFixed(0) : kilohertz.toFixed(1)} kHz`
  }

  return `${Math.round(sampleRateHz)} Hz`
}

function formatMediaDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return '--'
  }

  return formatTime(seconds)
}

function formatPercent(value: number | null | undefined, fallbackLabel: string): string {
  if (value == null) {
    return fallbackLabel
  }

  return `${Math.round(value * 100)}%`
}

export function App(): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const subtitleActionsRef = useRef<HTMLDetailsElement | null>(null)
  const subtitleDisplayControlsRef = useRef<HTMLDetailsElement | null>(null)
  const downloadDialogRef = useRef<HTMLElement | null>(null)
  const holdRightArrowTimerRef = useRef<number | null>(null)
  const holdRightArrowRestoreRateRef = useRef<number | null>(null)
  const controlDeckHideTimerRef = useRef<number | null>(null)
  const playbackEndedRef = useRef(false)
  const lastSavedProgressRef = useRef<{ path: string | null; time: number }>({ path: null, time: -1 })
  const [state, setState] = useState<PlayerState>(initialPlayerState)
  const [asrStatus, setAsrStatus] = useState<AsrRuntimeStatus | null>(null)
  const [asrProgress, setAsrProgress] = useState<AsrJobProgress | null>(null)
  const [subtitleResult, setSubtitleResult] = useState<AsrSubtitleResult | null>(null)
  const [translatedSubtitleResult, setTranslatedSubtitleResult] = useState<AsrSubtitleTranslationResult | null>(null)
  const [asrNotice, setAsrNotice] = useState<AsrNotice | null>(null)
  const [activeSubtitle, setActiveSubtitle] = useState<AsrSubtitleResult | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<AsrModelDownloadProgress | null>(null)
  const [isAsrBusy, setIsAsrBusy] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [isDetectingWhisperBinary, setIsDetectingWhisperBinary] = useState(false)
  const [isSelectingWhisperBinary, setIsSelectingWhisperBinary] = useState(false)
  const [isClipExportDialogOpen, setIsClipExportDialogOpen] = useState(false)
  const [isExportingClip, setIsExportingClip] = useState(false)
  const [isTranslatingSubtitle, setIsTranslatingSubtitle] = useState(false)
  const [isMediaDetailsDialogOpen, setIsMediaDetailsDialogOpen] = useState(false)
  const [runtimeSetupMessage, setRuntimeSetupMessage] = useState<{ success: boolean; message: string } | null>(null)
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false)
  const [appSettings, setAppSettings] = useState<AppSettings>(createDefaultAppSettings())
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false)
  const [isControlDeckVisible, setIsControlDeckVisible] = useState(true)
  const [mediaMetadata, setMediaMetadata] = useState<MediaProbeMetadata | null>(null)
  const copy = getAppCopy(appSettings.ui.locale)
  const isSidePanelVisible = state.panelMode !== 'none'
  const installedModelCount = asrStatus?.installedModels.length ?? 0
  const canDownloadRecommendedModel = Boolean(asrStatus && !isDownloadingModel)
  const canGenerateSubtitle = Boolean(
    state.currentFile && asrStatus?.available && !isAsrBusy && !isDownloadingModel && !isTranslatingSubtitle
  )
  const subtitlePath = activeSubtitle?.subtitlePath ?? subtitleResult?.subtitlePath ?? null
  const subtitleSrtPath = activeSubtitle?.subtitleSrtPath ?? subtitleResult?.subtitleSrtPath ?? null
  const canTranslateSubtitle = Boolean(subtitlePath && !isAsrBusy && !isTranslatingSubtitle)
  const subtitleTargetLanguageLabel = copy.subtitleLanguageOptions[appSettings.subtitles.targetLanguage].label
  const canOpenSubtitleTools = Boolean(state.currentFile)
  const hasCurrentFile = Boolean(state.currentFile)
  const canOpenSubtitleFolder = Boolean(subtitlePath)
  const canOpenSubtitleSrt = Boolean(subtitleSrtPath)
  const hasClipExportSubtitle = Boolean(subtitlePath || subtitleSrtPath)
  const subtitleStatusLabel = activeSubtitle?.subtitleUrl
    ? copy.panels.subtitleStatusReady
    : subtitlePath
      ? copy.panels.subtitleStatusCached
      : copy.panels.subtitleStatusIdle
  const preferredModelSourceId = appSettings.asr.preferredModelSourceId
  const initialSettingsSectionId: AppSettingsSectionId =
    state.panelMode === 'asr' ? 'subtitles' : appSettings.ui.lastSettingsSectionId
  const recommendedModelManifest = asrStatus?.recommendedModelManifest ?? null
  const recommendedModelSources = recommendedModelManifest
    ? [
        ...recommendedModelManifest.sources.filter((source) => source.id === preferredModelSourceId),
        ...recommendedModelManifest.sources.filter((source) => source.id !== preferredModelSourceId)
      ]
    : []
  const modelViewState = recommendedModelManifest
    ? buildAsrModelViewState({
        copy,
        recommendedManifest: recommendedModelManifest,
        installedModels: asrStatus?.installedModels ?? [],
        isDownloadingModel,
        downloadProgress,
        hasWhisperRuntime: Boolean(asrStatus?.binaryPath),
        hasFfmpegRuntime: Boolean(asrStatus?.ffmpegPath)
      })
    : null
  const isControlDeckHidden =
    Boolean(state.currentFile && state.isPlaying && appSettings.playback.autoHideControlDeck) && !isControlDeckVisible
  const playbackTimeLabel = formatPlaybackTimeLabel(
    state.currentTime,
    state.duration,
    appSettings.playback.showTotalPlaybackTime
  )
  const mediaFormat = mediaMetadata?.details?.format ?? null
  const mediaDurationSeconds = state.duration > 0 ? state.duration : mediaMetadata?.durationSeconds ?? null
  const mediaVideoWidth = state.videoWidth > 0 ? state.videoWidth : mediaMetadata?.video?.width ?? null
  const mediaVideoHeight = state.videoHeight > 0 ? state.videoHeight : mediaMetadata?.video?.height ?? null
  const mediaContainerName =
    typeof mediaFormat?.format_name === 'string' && mediaFormat.format_name.trim().length > 0
      ? mediaFormat.format_name.trim()
      : null
  const mediaContainerLabel =
    typeof mediaFormat?.format_long_name === 'string' && mediaFormat.format_long_name.trim().length > 0
      ? mediaFormat.format_long_name.trim()
      : typeof mediaFormat?.format_name === 'string' && mediaFormat.format_name.trim().length > 0
        ? mediaFormat.format_name.trim()
        : state.currentFile?.extension
          ? state.currentFile.extension.toUpperCase()
          : '--'
  const mediaVideo = mediaMetadata?.video ?? null
  const mediaAudio = mediaMetadata?.audio ?? null
  const mediaFileSizeLabel = formatFileSize(mediaMetadata?.fileSizeBytes)
  const mediaDurationLabel = formatMediaDuration(mediaDurationSeconds)
  const mediaOverallBitrateLabel = formatBitrate(mediaMetadata?.overallBitrateKbps)
  const mediaResolutionLabel = formatResolution(mediaVideoWidth, mediaVideoHeight)
  const mediaAspectRatioLabel = formatAspectRatio(mediaVideoWidth, mediaVideoHeight, mediaVideo?.displayAspectRatio ?? null)
  const mediaVideoCodecLabel = formatCodecLabel(mediaVideo?.codec ?? null, mediaVideo?.profile ?? null)
  const mediaFrameRateLabel = formatFrameRate(mediaVideo?.frameRate)
  const mediaAudioCodecLabel = formatCodecLabel(mediaAudio?.codec ?? null, mediaAudio?.profile ?? null)
  const mediaAudioChannelsLabel = formatChannelLayout(mediaAudio?.channelLayout ?? null)
  const mediaAudioSampleRateLabel = formatSampleRate(mediaAudio?.sampleRateHz)
  const mediaAudioBitrateLabel = formatBitrate(mediaAudio?.bitRateKbps)
  const playbackPositionInfoLabel = `${formatTime(state.currentTime)} / ${playbackTimeLabel}`
  const playbackSpeedInfoLabel = `${state.playbackRate}x`
  const playbackVolumeInfoLabel = `${Math.round((state.muted ? 0 : state.volume) * 100)}%`
  const subtitleVttStatusLabel = subtitlePath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle
  const subtitleSrtStatusLabel = subtitleSrtPath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle

  useModalFocusTrap(
    isDownloadDialogOpen && Boolean(recommendedModelManifest),
    downloadDialogRef,
    '.download-source-option'
  )

  const patchAppSettings = (updater: (current: AppSettings) => AppSettings): void => {
    setAppSettings((current) => {
      const next = updater(current)
      void window.aiv.setAppSettings(next).catch(() => undefined)
      return next
    })
  }

  const patchAppSettingsSection: AppSettingsSectionPatcher = createAppSettingsSectionPatcher(patchAppSettings)

  const getInitialPlaybackTime = (filePath: string): number => {
    if (!appSettings.playback.rememberProgress) {
      return 0
    }

    const savedTime = appSettings.playback.lastProgressByPath[filePath]
    return Number.isFinite(savedTime) && savedTime > 0 ? savedTime : 0
  }

  const persistPlaybackProgress = (currentTime: number, force = false): void => {
    const currentFilePath = state.currentFile?.path
    if (!currentFilePath || !appSettings.playback.rememberProgress) {
      return
    }

    const clampedTime = Math.max(0, currentTime)
    const previous = lastSavedProgressRef.current

    if (!force && previous.path === currentFilePath && clampedTime - previous.time < 5) {
      return
    }

    lastSavedProgressRef.current = { path: currentFilePath, time: clampedTime }
    patchAppSettingsSection('playback', (currentPlayback) => ({
      ...currentPlayback,
      lastProgressByPath: {
        ...currentPlayback.lastProgressByPath,
        [currentFilePath]: clampedTime
      }
    }))
  }

  const syncPlaybackMemory = (volume: number, muted: boolean, playbackRate: number): void => {
    patchAppSettingsSection('playback', {
      lastVolume: muted ? 0 : volume,
      lastMuted: muted,
      lastPlaybackRate: playbackRate
    })
  }

  const syncClipExportPreferences = (durationSeconds: ClipExportLengthSeconds, mode: ClipExportMode): void => {
    patchAppSettingsSection('capture', {
      clipExportLengthSeconds: durationSeconds,
      clipExportMode: mode
    })
  }

  const patchSubtitleDisplaySettings = (patch: Partial<AppSettings['subtitles']>): void => {
    patchAppSettingsSection('subtitles', patch)
  }

  const resetSubtitleDisplaySettings = (): void => {
    patchAppSettingsSection('subtitles', createDefaultAppSettings().subtitles)
  }

  const resetAppSettings = (): void => {
    const defaults = createDefaultAppSettings()
    setAppSettings(defaults)
    setState((current) => ({
      ...current,
      panelMode: defaults.ui.defaultPanelMode,
      volume: defaults.playback.lastVolume,
      muted: defaults.playback.lastMuted,
      playbackRate: defaults.playback.lastPlaybackRate
    }))
    void window.aiv.setAppSettings(defaults).then((nextSettings) => setAppSettings(nextSettings)).catch(() => undefined)
  }

  const clearControlDeckHideTimer = (): void => {
    if (controlDeckHideTimerRef.current != null) {
      window.clearTimeout(controlDeckHideTimerRef.current)
      controlDeckHideTimerRef.current = null
    }
  }

  const revealControlDeck = (): void => {
    clearControlDeckHideTimer()
    setIsControlDeckVisible(true)

    if (!state.currentFile || !state.isPlaying || !appSettings.playback.autoHideControlDeck) {
      return
    }

    const delaySeconds = Math.max(1, appSettings.playback.controlDeckAutoHideSeconds)
    controlDeckHideTimerRef.current = window.setTimeout(() => {
      controlDeckHideTimerRef.current = null
      setIsControlDeckVisible(false)
    }, delaySeconds * 1000)
  }

  const loadFiles = (files: MediaFile[]): void => {
    if (files.length === 0) {
      return
    }

    playbackEndedRef.current = false
    setActiveSubtitle(null)
    setSubtitleResult(null)
    setTranslatedSubtitleResult(null)
    setAsrNotice(null)
    setAsrProgress(null)

    setState((current) => {
      const playlist = mergePlaylist(current.playlist, files)
      const currentFile = getPlaylistFileByPath(playlist, files[0])
      const currentTime = getInitialPlaybackTime(currentFile.path)
      lastSavedProgressRef.current = { path: currentFile.path, time: currentTime }
      return {
        ...current,
        playlist,
        currentFile,
        currentTime,
        duration: 0,
        videoWidth: 0,
        videoHeight: 0,
        isPlaying: false,
        autoPlayRequestId: current.autoPlayRequestId + 1,
        error: null
      }
    })
  }

  const openFiles = async (): Promise<void> => {
    const files = await window.aiv.openMediaFiles()
    loadFiles(files)
  }

  const pickDefaultFolder = async (): Promise<string | null> => {
    return window.aiv.openMediaDirectory()
  }

  const pickCaptureFolder = async (): Promise<string | null> => {
    return window.aiv.openFolderPicker({
      title: copy.settingsDialog.capture.selectFolderDialogTitle,
      defaultPath: appSettings.capture.saveDirectoryPath
    })
  }

  const togglePanelMode = (panelMode: PanelMode): void => {
    const nextPanelMode = state.panelMode === panelMode ? 'none' : panelMode

    setState((current) => ({
      ...current,
      panelMode: nextPanelMode
    }))
  }

  const openPanelMode = (panelMode: Exclude<PanelMode, 'none'>): void => {
    setState((current) => ({
      ...current,
      panelMode
    }))
  }

  const createMediaFilesFromPaths = async (paths: string[]): Promise<MediaFile[]> => {
    return Promise.all(paths.map((path) => window.aiv.createMediaFile(path)))
  }

  const togglePlay = async (): Promise<void> => {
    revealControlDeck()

    const video = videoRef.current
    if (!video || !state.currentFile) {
      return
    }

    if (video.paused) {
      try {
        await video.play()
      } catch (error) {
        const message = getPlayFailureMessage(copy, error)
        if (message) {
          setPlaybackError(message)
        }
      }
    } else {
      video.pause()
    }
  }

  const seekBy = (seconds: number): void => {
    revealControlDeck()

    const video = videoRef.current
    if (!video) {
      return
    }

    video.currentTime = clamp(video.currentTime + seconds, 0, video.duration || 0)
  }

  const stopPlayback = (): void => {
    if (!state.currentFile) {
      return
    }

    revealControlDeck()

    const currentFile = state.currentFile
    const video = videoRef.current

    if (video && currentFile) {
      playbackEndedRef.current = false
      video.currentTime = 0
      video.pause()

      setState((current) => ({
        ...current,
        isPlaying: false,
        currentTime: 0
      }))

      lastSavedProgressRef.current = { path: currentFile.path, time: 0 }
      persistPlaybackProgress(0, true)
    }

    void window.aiv.stopNativePlayer().catch(() => undefined)
  }

  const selectFile = (file: MediaFile): void => {
    playbackEndedRef.current = false
    setActiveSubtitle(null)
    setSubtitleResult(null)
    setTranslatedSubtitleResult(null)
    setAsrNotice(null)
    setAsrProgress(null)
    const currentTime = getInitialPlaybackTime(file.path)
    lastSavedProgressRef.current = { path: file.path, time: currentTime }

    setState((current) => ({
      ...current,
      currentFile: file,
      currentTime,
      duration: 0,
      videoWidth: 0,
      videoHeight: 0,
      isPlaying: false,
      autoPlayRequestId: current.autoPlayRequestId + 1,
      error: null
    }))
  }

  const playAdjacent = (direction: -1 | 1): void => {
    revealControlDeck()

    if (!state.currentFile || state.playlist.length === 0) {
      return
    }

    const currentIndex = state.playlist.findIndex((item) => item.path === state.currentFile?.path)
    const nextIndex = clamp(currentIndex + direction, 0, state.playlist.length - 1)
    selectFile(state.playlist[nextIndex])
  }

  const toggleMute = (): void => {
    revealControlDeck()

    const video = videoRef.current
    if (!video) {
      return
    }

    const nextMuted = !video.muted
    video.muted = nextMuted

    setState((current) => ({ ...current, muted: nextMuted }))
    syncPlaybackMemory(state.volume, nextMuted, state.playbackRate)
  }

  const toggleFullscreen = async (): Promise<void> => {
    revealControlDeck()

    if (document.fullscreenElement) {
      await document.exitFullscreen()
      return
    }

    await document.documentElement.requestFullscreen()
  }

  const clearPlaybackError = (): void => {
    setState((current) => (current.error ? { ...current, error: null } : current))
  }

  const setPlaybackError = (message: string): void => {
    setState((current) => ({
      ...current,
      error: message
    }))
  }

  const handleMediaError = (event: React.SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    const message = getMediaErrorMessage(copy, video)

    if (!message) {
      clearPlaybackError()
      return
    }

    setPlaybackError(message)
  }

  const refreshAsrStatus = async (): Promise<AsrRuntimeStatus> => {
    const nextStatus = await window.aiv.checkAsrRuntime()
    setAsrStatus(nextStatus)
    return nextStatus
  }

  const autoDetectWhisperBinary = async (): Promise<void> => {
    setIsDetectingWhisperBinary(true)
    setRuntimeSetupMessage(null)

    try {
      const result = await window.aiv.autoDetectWhisperBinary()

      if (result.status) {
        setAsrStatus(result.status)
      }

      setRuntimeSetupMessage({
        success: result.success,
        message: result.message
      })
    } finally {
      setIsDetectingWhisperBinary(false)
    }
  }

  const selectWhisperBinary = async (): Promise<void> => {
    setIsSelectingWhisperBinary(true)
    setRuntimeSetupMessage(null)

    try {
      const result = await window.aiv.selectWhisperBinary()

      if (result.status) {
        setAsrStatus(result.status)
      }

      if (!result.canceled) {
        setRuntimeSetupMessage({
          success: result.success,
          message: result.message
        })
      }
    } finally {
      setIsSelectingWhisperBinary(false)
    }
  }

  const openModelDownloadDialog = (): void => {
    if (!canDownloadRecommendedModel) {
      return
    }

    setIsDownloadDialogOpen(true)
  }

  const downloadRecommendedModel = async (sourceId: AsrModelSourceId = preferredModelSourceId): Promise<void> => {
    if (!asrStatus) {
      return
    }

    setIsDownloadDialogOpen(false)
    setIsDownloadingModel(true)
    setDownloadProgress(null)
    setAsrNotice(null)

    try {
      const result = await window.aiv.downloadAsrModel(asrStatus.recommendedModelManifest.id, sourceId)

      if (!result.success) {
        setAsrProgress({
          stage: 'failed',
          percent: null,
          message: result.message
        })
      }

      const nextStatus = await refreshAsrStatus()
      const recommendedModelInstalled = nextStatus.installedModels.some(
        (model) => model.id === nextStatus.recommendedModelManifest.id
      )

      if (result.success && recommendedModelInstalled) {
        setDownloadProgress(null)
      }
    } finally {
      setIsDownloadingModel(false)
    }
  }

  const generateSubtitle = async (): Promise<void> => {
    if (!state.currentFile) {
      return
    }

    setIsAsrBusy(true)
    setSubtitleResult(null)
    setTranslatedSubtitleResult(null)
    setAsrNotice(null)
    setAsrProgress({
      stage: 'checking',
      percent: 0,
      message: copy.runtime.preparingSubtitleCache
    })

    try {
      const result = await window.aiv.generateAsrSubtitle({
        mediaPath: state.currentFile.path,
        modelId: asrStatus?.recommendedModelManifest.id,
        language: appSettings.asr.defaultSubtitleLanguage
      })

      setSubtitleResult(result.success ? result : null)
      setAsrNotice(result)

      if (result.success && result.subtitleUrl) {
        setActiveSubtitle(result)
      }

      await refreshAsrStatus()
    } finally {
      setIsAsrBusy(false)
    }
  }

  const openSubtitleFolder = async (): Promise<void> => {
    if (!subtitlePath) {
      return
    }

    const success = await window.aiv.showItemInFolder(subtitlePath)
    if (!success) {
      setAsrNotice({
        success: false,
        message: copy.messages.noSubtitleFolder
      })
    }
  }

  const openSubtitleSrtFile = async (): Promise<void> => {
    if (!subtitleSrtPath) {
      return
    }

    const success = await window.aiv.openPath(subtitleSrtPath)
    if (!success) {
      setAsrNotice({
        success: false,
        message: copy.messages.noSrtFile
      })
    }
  }

  const exportSubtitleSrtFile = async (): Promise<void> => {
    if (!subtitlePath) {
      return
    }

    const result = await window.aiv.exportAsrSubtitleSrt({
      subtitlePath,
      subtitleSrtPath: subtitleSrtPath ?? undefined
    })

    setAsrNotice(result)
  }

  const translateSubtitle = async (): Promise<void> => {
    if (!subtitlePath || isTranslatingSubtitle) {
      return
    }

    const subtitleSourceLanguage =
      activeSubtitle?.subtitleLanguage ?? subtitleResult?.subtitleLanguage ?? appSettings.asr.defaultSubtitleLanguage

    setIsTranslatingSubtitle(true)
    setAsrNotice(null)

    try {
      const result = await window.aiv.translateAsrSubtitle({
        subtitlePath,
        subtitleSrtPath: subtitleSrtPath ?? undefined,
        sourceLanguage: subtitleSourceLanguage,
        targetLanguage: appSettings.subtitles.targetLanguage
      })

      setTranslatedSubtitleResult(result.success ? result : null)
      setAsrNotice(result)

      if (result.success && result.subtitleUrl && appSettings.subtitles.displayMode === 'source') {
        patchSubtitleDisplaySettings({ displayMode: 'translation' })
      }
    } finally {
      setIsTranslatingSubtitle(false)
    }
  }

  const copySubtitleSrtPath = async (): Promise<void> => {
    if (!subtitleSrtPath) {
      return
    }

    const result = await window.aiv.copyTextToClipboard({
      text: subtitleSrtPath
    })

    setAsrNotice(result)
  }

  const openClipExportDialog = (): void => {
    if (!state.currentFile || isExportingClip) {
      return
    }

    setIsClipExportDialogOpen(true)
  }

  const confirmClipExport = async (selection: { durationSeconds: ClipExportLengthSeconds; mode: ClipExportMode }): Promise<void> => {
    const currentFile = state.currentFile
    if (!currentFile || isExportingClip) {
      return
    }

    syncClipExportPreferences(selection.durationSeconds, selection.mode)

    setIsClipExportDialogOpen(false)
    setIsExportingClip(true)

    try {
      const request: MediaClipExportRequest = {
        mediaPath: currentFile.path,
        startSeconds: videoRef.current?.currentTime ?? state.currentTime,
        durationSeconds: selection.durationSeconds,
        mode: selection.mode,
        subtitlePath: subtitlePath ?? undefined,
        subtitleSrtPath: subtitleSrtPath ?? undefined
      }
      const result = await window.aiv.exportMediaClip(request)

      if (!result.canceled) {
        setAsrNotice(result)
      }
    } catch (error) {
      setAsrNotice({
        success: false,
        message: error instanceof Error ? `${copy.runtime.clipExportFailed}：${error.message}` : `${copy.runtime.clipExportFailed}：${String(error)}`
      })
    } finally {
      setIsExportingClip(false)
    }
  }

  const copySubtitleVttPath = async (): Promise<void> => {
    if (!subtitlePath) {
      return
    }

    const result = await window.aiv.copyTextToClipboard({
      text: subtitlePath
    })

    setAsrNotice(result)
  }

  const closeSubtitleActionsMenu = (event: ReactMouseEvent<HTMLButtonElement>): void => {
    const details = event.currentTarget.closest('details')
    details?.removeAttribute('open')
  }

  useEffect(() => {
    const currentFilePath = state.currentFile?.path
    const modelId = asrStatus?.recommendedModelManifest.id

    if (!currentFilePath || !modelId || !appSettings.asr.autoLoadCachedSubtitles) {
      return
    }

    let cancelled = false

    const restoreCachedSubtitle = async (): Promise<void> => {
      const result = await window.aiv.resolveAsrSubtitleCache({
        mediaPath: currentFilePath,
        modelId
      })

      if (cancelled || !result.success || !result.subtitleUrl) {
        return
      }

      setActiveSubtitle(result)
      setSubtitleResult(result)
      setAsrNotice(result)
      setAsrProgress(null)
    }

    void restoreCachedSubtitle()

    return () => {
      cancelled = true
    }
  }, [state.currentFile?.path, asrStatus?.recommendedModelManifest.id, appSettings.asr.autoLoadCachedSubtitles])

  useEffect(() => {
    revealControlDeck()
    return clearControlDeckHideTimer
  }, [
    state.currentFile?.path,
    state.isPlaying,
    appSettings.playback.autoHideControlDeck,
    appSettings.playback.controlDeckAutoHideSeconds
  ])

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.volume = state.volume
    video.playbackRate = state.playbackRate
    video.muted = state.muted
  }, [state.volume, state.playbackRate, state.muted])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !state.currentFile) {
      return
    }

    const startTime = getInitialPlaybackTime(state.currentFile.path)
    video.currentTime = startTime
    video.playbackRate = state.playbackRate
    video.volume = state.volume
    video.muted = state.muted
    lastSavedProgressRef.current = { path: state.currentFile.path, time: startTime }

    const playTimer = window.setTimeout(() => {
      void video.play().catch((error: unknown) => {
        const message = getPlayFailureMessage(copy, error)
        if (message) {
          setPlaybackError(message)
        }
      })
    }, 0)

    return () => window.clearTimeout(playTimer)
  }, [state.currentFile?.id, state.autoPlayRequestId])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !state.currentFile || !appSettings.playback.rememberProgress) {
      return
    }

    const savedTime = appSettings.playback.lastProgressByPath[state.currentFile.path] ?? 0
    const nextTime = resolvePlaybackStartTime(savedTime, mediaDurationSeconds)

    if (nextTime === 0 && playbackEndedRef.current) {
      return
    }

    if (Math.abs(video.currentTime - nextTime) < 0.25) {
      return
    }

    video.currentTime = nextTime
    lastSavedProgressRef.current = { path: state.currentFile.path, time: nextTime }
    setState((current) => ({ ...current, currentTime: nextTime }))
  }, [state.currentFile?.path, appSettings.playback.rememberProgress, appSettings.playback.lastProgressByPath, mediaDurationSeconds])

  useEffect(() => {
    const clearHoldRightArrowTimer = (): void => {
      if (holdRightArrowTimerRef.current != null) {
        window.clearTimeout(holdRightArrowTimerRef.current)
        holdRightArrowTimerRef.current = null
      }
    }

    const restoreHoldRightArrowSpeed = (): void => {
      clearHoldRightArrowTimer()

      const previousRate = holdRightArrowRestoreRateRef.current
      if (previousRate == null) {
        return
      }

      holdRightArrowRestoreRateRef.current = null

      const video = videoRef.current
      if (video) {
        video.playbackRate = previousRate
      }

      setState((current) => ({
        ...current,
        playbackRate: previousRate
      }))
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (isDownloadDialogOpen || isSettingsDialogOpen || isClipExportDialogOpen || isExportingClip) {
        return
      }

      if (event.key === 'Escape') {
        const subtitleDisplayControls = subtitleDisplayControlsRef.current
        if (subtitleDisplayControls?.open) {
          subtitleDisplayControls.open = false
          return
        }

        const subtitleActions = subtitleActionsRef.current
        if (subtitleActions?.open) {
          subtitleActions.open = false
          return
        }
      }

      if (
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement ||
        event.target instanceof HTMLSelectElement
      ) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        revealControlDeck()
        void togglePlay()
        return
      }
      if (event.code === 'ArrowLeft') {
        revealControlDeck()
        if (!event.repeat) {
          seekBy(-appSettings.playback.seekStepSeconds)
        }
        return
      }
      if (event.code === 'ArrowRight') {
        revealControlDeck()
        if (event.repeat) {
          return
        }

        seekBy(appSettings.playback.seekStepSeconds)

        if (appSettings.playback.holdRightArrowSpeed > 1) {
          clearHoldRightArrowTimer()
          holdRightArrowRestoreRateRef.current = state.playbackRate
          holdRightArrowTimerRef.current = window.setTimeout(() => {
            const video = videoRef.current
            if (!video) {
              return
            }

            const heldSpeed = appSettings.playback.holdRightArrowSpeed
            video.playbackRate = heldSpeed
            setState((current) => ({
              ...current,
              playbackRate: heldSpeed
            }))
          }, 280)
        }

        return
      }
      if (event.code === 'KeyO' && (event.metaKey || event.ctrlKey)) {
        revealControlDeck()
        void openFiles()
        return
      }
      if (event.code === 'KeyL') {
        revealControlDeck()
        togglePanelMode('playlist')
        return
      }

      if (!state.currentFile) {
        return
      }

      if (event.code === 'KeyM') {
        revealControlDeck()
        toggleMute()
        return
      }
      if (event.code === 'KeyS') {
        revealControlDeck()
        stopPlayback()
        return
      }
      if (event.code === 'KeyF') {
        revealControlDeck()
        void toggleFullscreen()
        return
      }
    }

    const handleKeyUp = (event: KeyboardEvent): void => {
      if (event.code === 'ArrowRight') {
        restoreHoldRightArrowSpeed()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)
    return () => {
      clearHoldRightArrowTimer()
      restoreHoldRightArrowSpeed()
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [
    appSettings.playback.holdRightArrowSpeed,
    appSettings.playback.seekStepSeconds,
    isDownloadDialogOpen,
    isSettingsDialogOpen,
    isClipExportDialogOpen,
    isExportingClip
  ])

  useEffect(() => {
    const handleMouseDown = (event: MouseEvent): void => {
      const subtitleActions = subtitleActionsRef.current
      if (!subtitleActions?.open) {
        return
      }

      if (event.target instanceof Node && subtitleActions.contains(event.target)) {
        return
      }

      subtitleActions.open = false
    }

    window.addEventListener('mousedown', handleMouseDown)
    return () => window.removeEventListener('mousedown', handleMouseDown)
  }, [])

  useEffect(() => {
    const handlePointerDown = (event: PointerEvent): void => {
      const controls = subtitleDisplayControlsRef.current
      if (!controls?.open) {
        return
      }

      if (event.target instanceof Node && controls.contains(event.target)) {
        return
      }

      controls.open = false
    }

    window.addEventListener('pointerdown', handlePointerDown)
    return () => window.removeEventListener('pointerdown', handlePointerDown)
  }, [])

  useEffect(() => {
    if (!appSettings.playback.pauseWhenMinimized) {
      return
    }

    const pauseVideo = (): void => {
      const video = videoRef.current
      if (video && !video.paused) {
        video.pause()
      }
    }

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'hidden') {
        pauseVideo()
      }
    }

    window.addEventListener('blur', pauseVideo)
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => {
      window.removeEventListener('blur', pauseVideo)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [appSettings.playback.pauseWhenMinimized])

  useEffect(() => {
    void refreshAsrStatus()
  }, [])

  useEffect(() => {
    let cancelled = false

    void window.aiv.getAppSettings().then((settings) => {
      if (cancelled) {
        return
      }

      setAppSettings(settings)
      setState((current) => ({
        ...current,
        panelMode: settings.ui.defaultPanelMode,
        volume: settings.playback.rememberVolume ? settings.playback.lastVolume : current.volume,
        muted: settings.playback.rememberVolume ? settings.playback.lastMuted : current.muted,
        playbackRate: settings.playback.rememberPlaybackRate ? settings.playback.lastPlaybackRate : current.playbackRate,
        currentTime:
          settings.playback.rememberProgress && current.currentFile
            ? settings.playback.lastProgressByPath[current.currentFile.path] ?? current.currentTime
            : current.currentTime
      }))
    })

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!isDownloadDialogOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isDownloadingModel) {
        setIsDownloadDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isDownloadDialogOpen, isDownloadingModel])

  useEffect(() => {
    if (!isSettingsDialogOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setIsSettingsDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isSettingsDialogOpen])

  useEffect(() => {
    if (!isClipExportDialogOpen) {
      return
    }

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isExportingClip) {
        setIsClipExportDialogOpen(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isClipExportDialogOpen, isExportingClip])

  useEffect(() => {
    void window.aiv.getInitialMediaFiles().then(loadFiles)
    return window.aiv.onMediaFilesOpened(loadFiles)
  }, [])

  useEffect(() => {
    const cleanupDownload = window.aiv.onAsrModelDownloadProgress(setDownloadProgress)
    const cleanupJob = window.aiv.onAsrJobProgress(setAsrProgress)

    return () => {
      cleanupDownload()
      cleanupJob()
    }
  }, [])

  useEffect(() => {
    const filePath = state.currentFile?.path

    if (!filePath) {
      setMediaMetadata(null)
      return
    }

    let cancelled = false

    setMediaMetadata(null)

    void window.aiv
      .getMediaMetadata(filePath)
      .then((metadata) => {
        if (!cancelled) {
          setMediaMetadata(metadata)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setMediaMetadata(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [state.currentFile?.path])

  useEffect(() => {
    if (!state.currentFile) {
      setIsMediaDetailsDialogOpen(false)
    }
  }, [state.currentFile])

  return (
    <div
      className="app-shell"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        const paths = Array.from(event.dataTransfer.files)
          .map((file) => window.aiv.getPathForFile(file))
          .filter(Boolean)
        void createMediaFilesFromPaths(paths).then(loadFiles)
      }}
    >
      <header className="titlebar">
        <div className="brand">
          <span className="brand-mark">A</span>
          <span>{copy.appName}</span>
        </div>
        <nav className="top-actions" aria-label="Primary">
          <button className="tool-button" type="button" onClick={openFiles} title={copy.topbar.openFiles}>
            <FolderOpen size={17} />
          </button>
          <button
            className={`tool-button ${state.panelMode === 'playlist' ? 'active' : ''}`}
            type="button"
            onClick={() => togglePanelMode('playlist')}
            title={copy.topbar.togglePlaylist}
            aria-pressed={state.panelMode === 'playlist'}
          >
            <PanelRight size={17} />
          </button>
          <button
            className={`tool-button ${state.panelMode === 'asr' ? 'active' : ''}`}
            type="button"
            onClick={() => togglePanelMode('asr')}
            title={copy.topbar.toggleAsr}
            aria-pressed={state.panelMode === 'asr'}
          >
            <Sparkles size={17} />
          </button>
          <button
            className={`tool-button ${state.panelMode === 'info' ? 'active' : ''}`}
            type="button"
            title={copy.topbar.toggleInfo}
            aria-label={copy.topbar.toggleInfo}
            onClick={() => togglePanelMode('info')}
            aria-pressed={state.panelMode === 'info'}
          >
            <Info size={17} />
          </button>
          <button
            className={`tool-button ${isSettingsDialogOpen ? 'active' : ''}`}
            type="button"
            title={isSettingsDialogOpen ? copy.topbar.closeSettings : copy.topbar.openSettings}
            aria-label={isSettingsDialogOpen ? copy.topbar.closeSettings : copy.topbar.openSettings}
            onClick={() => {
              if (isDownloadDialogOpen || isClipExportDialogOpen || isExportingClip) {
                return
              }

              setIsSettingsDialogOpen((current) => !current)
            }}
            aria-pressed={isSettingsDialogOpen}
          >
            <Settings size={17} />
          </button>
        </nav>
      </header>

      <main className={`workspace ${isSidePanelVisible ? 'with-side-panel' : 'side-panel-collapsed'}`}>
        <section
          className={`stage ${isControlDeckHidden ? 'control-deck-hidden' : ''}`}
          aria-label={copy.emptyState.title}
          onMouseEnter={revealControlDeck}
          onMouseMove={revealControlDeck}
        >
          <div className="video-frame">
            {state.currentFile ? (
              <video
                ref={videoRef}
                className="video-surface"
                src={state.currentFile.url}
                preload="metadata"
                onClick={() => {
                  if (appSettings.playback.singleClickPause) {
                    revealControlDeck()
                    void togglePlay()
                  }
                }}
                onPlay={() => setState((current) => ({ ...current, isPlaying: true }))}
                onPlaying={clearPlaybackError}
                onCanPlay={clearPlaybackError}
                onPause={(event) => {
                  setState((current) => ({ ...current, isPlaying: false }))
                  persistPlaybackProgress(event.currentTarget.currentTime, true)
                }}
                onEnded={(event) => {
                  playbackEndedRef.current = true
                  setState((current) => ({ ...current, isPlaying: false }))
                  persistPlaybackProgress(0, true)
                }}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration || 0
                  const currentTime = event.currentTarget.currentTime
                  const resumeTime = resolvePlaybackStartTime(currentTime, duration)
                  const videoWidth = event.currentTarget.videoWidth || 0
                  const videoHeight = event.currentTarget.videoHeight || 0
                  if (Math.abs(currentTime - resumeTime) > 0.25) {
                    event.currentTarget.currentTime = resumeTime
                  }
                  setState((current) => ({ ...current, duration, currentTime: resumeTime, videoWidth, videoHeight, error: null }))
                  persistPlaybackProgress(resumeTime, true)
                }}
                onTimeUpdate={(event) => {
                  const currentTime = event.currentTarget.currentTime
                  setState((current) => ({ ...current, currentTime, error: null }))
                  persistPlaybackProgress(currentTime)
                }}
                onVolumeChange={(event) => {
                  const volume = event.currentTarget.volume
                  const muted = event.currentTarget.muted
                  setState((current) => ({
                    ...current,
                    volume,
                    muted
                  }))
                }}
                onError={handleMediaError}
                controls={false}
              />
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <AudioLines size={46} />
                </div>
                <h1>{copy.emptyState.title}</h1>
                <p>{copy.emptyState.description}</p>
                <button className="primary-action" type="button" onClick={openFiles}>
                  <FolderOpen size={18} />
                  {copy.emptyState.openVideo}
                </button>
              </div>
            )}
          </div>

          <SubtitleOverlay
            subtitlePath={activeSubtitle?.subtitlePath ?? null}
            translationPath={translatedSubtitleResult?.subtitlePath ?? null}
            currentTime={state.currentTime}
            settings={appSettings.subtitles}
            copy={copy}
            controlsRef={subtitleDisplayControlsRef}
            onSettingsChange={patchSubtitleDisplaySettings}
            onResetSettings={resetSubtitleDisplaySettings}
          />

          {state.error ? (
            <div className="status-banner">
              <span>{state.error}</span>
            </div>
          ) : null}

          {hasCurrentFile ? (
            <div className={`control-deck ${isControlDeckHidden ? 'is-hidden' : ''}`} aria-hidden={isControlDeckHidden}>
              <div className="timeline-row">
                <span>{formatTime(state.currentTime)}</span>
                <input
                  className="timeline"
                  type="range"
                  min="0"
                  max={state.duration || 0}
                  value={state.currentTime}
                  step="0.1"
                  onChange={(event) => {
                    const nextTime = Number(event.currentTarget.value)
                    if (videoRef.current) {
                      videoRef.current.currentTime = nextTime
                    }
                    setState((current) => ({ ...current, currentTime: nextTime }))
                  }}
                  aria-label={copy.controls.playbackPosition}
                />
                <span>{playbackTimeLabel}</span>
              </div>

              <div className="controls-row">
                <div className="controls-primary">
                  <div className="control-group transport-group">
                    <button className="round-button" type="button" onClick={() => playAdjacent(-1)} title={copy.controls.previous}>
                      <SkipBack size={16} />
                    </button>
                    <button className="round-button primary" type="button" onClick={togglePlay} title={state.isPlaying ? copy.controls.pause : copy.controls.play}>
                      {state.isPlaying ? <Pause size={18} /> : <Play size={18} />}
                    </button>
                    <button className="round-button" type="button" onClick={() => playAdjacent(1)} title={copy.controls.next}>
                      <SkipForward size={16} />
                    </button>
                  </div>

                  <button
                    className="round-button stop-button"
                    type="button"
                    onClick={stopPlayback}
                    title={`${copy.controls.stopAndReset} (S)`}
                    aria-label={copy.controls.stopAndReset}
                    aria-keyshortcuts="S"
                  >
                    <Square size={14} fill="currentColor" stroke="none" />
                    <span>{copy.controls.stop}</span>
                  </button>

                  <div className="control-group volume-group">
                    <button className="round-button" type="button" onClick={toggleMute} title={copy.controls.mute}>
                      {state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                    </button>
                    <input
                      className="volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.01"
                      value={state.muted ? 0 : state.volume}
                      onChange={(event) => {
                        const nextVolume = Number(event.currentTarget.value)
                        if (videoRef.current) {
                          videoRef.current.volume = nextVolume
                          videoRef.current.muted = nextVolume === 0
                        }
                        const nextMuted = nextVolume === 0
                        setState((current) => ({ ...current, volume: nextVolume, muted: nextMuted }))
                        syncPlaybackMemory(nextVolume, nextMuted, state.playbackRate)
                      }}
                      aria-label={copy.controls.volume}
                    />
                  </div>
                </div>

                <div className="controls-secondary">
                  <div className="control-group secondary-group">
                    <div className="speed-control">
                      <select
                        className="speed-select"
                        value={state.playbackRate}
                        onChange={(event) => {
                          const playbackRate = Number(event.currentTarget.value)
                          if (videoRef.current) {
                            videoRef.current.playbackRate = playbackRate
                          }
                          setState((current) => ({ ...current, playbackRate }))
                          syncPlaybackMemory(state.volume, state.muted, playbackRate)
                        }}
                        aria-label={copy.controls.playbackSpeed}
                      >
                        {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                          <option key={speed} value={speed}>
                            {speed}x
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="speed-control-icon" size={12} aria-hidden="true" />
                    </div>
                    <button className="round-button" type="button" onClick={toggleFullscreen} title={copy.controls.fullscreen}>
                      <Maximize2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : null}
        </section>

        <aside
          className={`side-panel panel-${state.panelMode}`}
          aria-label={copy.panels.playlistTitle}
        >
          <div className="panel-switcher" role="tablist" aria-label={copy.panels.playlistTitle}>
            <button
              className={`panel-tab ${state.panelMode === 'playlist' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.panelMode === 'playlist'}
              onClick={() => openPanelMode('playlist')}
            >
              <ListVideo size={15} />
              <span>{copy.panels.playlistTitle}</span>
            </button>
            <button
              className={`panel-tab ${state.panelMode === 'asr' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.panelMode === 'asr'}
              onClick={() => openPanelMode('asr')}
            >
              <Sparkles size={15} />
              <span>{copy.panels.asrTitle}</span>
            </button>
            <button
              className={`panel-tab ${state.panelMode === 'info' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.panelMode === 'info'}
              onClick={() => openPanelMode('info')}
            >
              <Info size={15} />
              <span>{copy.panels.infoTitle}</span>
            </button>
          </div>

          <div className={`panel-content panel-content-${state.panelMode}`}>
          {state.panelMode === 'playlist' ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">{copy.panels.playlistKicker}</span>
                  <h2>{copy.panels.playlistTitle}</h2>
                </div>
                <ListVideo size={19} />
              </div>
              <div className={`playlist ${state.playlist.length === 0 ? 'is-empty' : ''}`}>
                {state.playlist.length === 0 ? (
                  <div className="panel-empty">{copy.panels.noMedia}</div>
                ) : (
                  state.playlist.map((file, index) => (
                    <button
                      className={`playlist-item ${state.currentFile?.path === file.path ? 'active' : ''}`}
                      key={file.id}
                      type="button"
                      onClick={() => selectFile(file)}
                    >
                      <span className="playlist-index">{String(index + 1).padStart(2, '0')}</span>
                      <span className="playlist-name">{file.name}</span>
                      <span className="playlist-ext">{file.extension}</span>
                    </button>
                  ))
                )}
              </div>
            </>
          ) : null}

          {state.panelMode === 'asr' ? (
            <>
              <div className="asr-stack">
                <div className="asr-card open">
                  <div className="asr-card-heading">
                    <div className="asr-card-title">
                      <Sparkles size={18} />
                      <span>{copy.asrPanel.engineStatus}</span>
                    </div>
                    <button className="mini-tool-button" type="button" onClick={refreshAsrStatus} title={copy.asrPanel.refreshEngine}>
                      <RefreshCcw size={14} />
                    </button>
                  </div>
                  <p>{asrStatus?.message ?? copy.asrPanel.detectingEngine}</p>
                  <div className="asr-meta">
                    <span>
                      <Clock size={14} />
                      {installedModelCount} {copy.asrPanel.modelFiles}
                    </span>
                    <span>{asrStatus?.available ? copy.asrPanel.engineReady : copy.asrPanel.engineNotReady}</span>
                  </div>
                  <div className="asr-runtime-grid">
                    <span>{copy.asrPanel.engineStatus}</span>
                    <strong>{asrStatus?.binaryPath ? copy.asrPanel.engineReady : copy.asrPanel.engineNotReady}</strong>
                    <span>ffmpeg</span>
                    <strong>{asrStatus?.ffmpegPath ? copy.asrPanel.engineReady : copy.asrPanel.engineNotReady}</strong>
                  </div>
                  {runtimeSetupMessage ? (
                    <div className={`asr-result ${runtimeSetupMessage.success ? 'success' : 'failed'}`}>
                      {runtimeSetupMessage.message}
                    </div>
                  ) : null}
                </div>

                <div className="asr-card open">
                  <div className="asr-card-heading">
                    <div className="asr-card-title">
                      <Download size={18} />
                      <span>{copy.asrPanel.modelFiles}</span>
                    </div>
                    <span className={`asr-status-pill ${modelViewState?.installState ?? 'missing'}`}>
                      {modelViewState?.statusLabel ?? copy.asrModelStatus.progressLabel}
                    </span>
                  </div>
                  <p>{modelViewState?.description ?? copy.modelView.missing(recommendedModelManifest?.name ?? '', recommendedModelManifest?.ramRequirement ?? '')}</p>
                  <div className="asr-model-list">
                    {asrStatus?.installedModels.length ? (
                      asrStatus.installedModels.map((model) => (
                        <div className="asr-model-item" key={model.path}>
                          <span>{model.name}</span>
                          <strong>{formatBytes(model.sizeBytes)}</strong>
                        </div>
                      ))
                    ) : (
                      <div className="asr-model-item muted">
                        <span>{recommendedModelManifest?.name ?? asrStatus?.recommendedModel ?? copy.asrPanel.noModel}</span>
                        <strong>
                          {recommendedModelManifest
                            ? formatBytes(recommendedModelManifest.expectedSizeBytes)
                            : asrStatus?.recommendedModel ?? 'ggml-large-v3-turbo-q5_0.bin'}
                        </strong>
                      </div>
                    )}
                  </div>
                  {downloadProgress && modelViewState?.shouldShowProgress ? (
                    <div className="progress-block">
                      <div className="progress-label">
                        <span>{downloadProgress.message}</span>
                        <strong>{formatPercent(downloadProgress.percent, copy.asrModelStatus.progressLabel)}</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.round((downloadProgress.percent ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  <button
                    className="asr-action-button"
                    type="button"
                    onClick={openModelDownloadDialog}
                    disabled={!canDownloadRecommendedModel}
                  >
                    {modelViewState?.installState.startsWith('installed') ? (
                      <RefreshCcw size={16} />
                    ) : (
                      <Download size={16} />
                    )}
                    {modelViewState?.actionLabel ?? copy.modelView.downloadRecommended}
                  </button>
                </div>

                <div className="asr-card open">
                  <div className="asr-card-heading">
                    <div className="asr-card-title">
                      <Captions size={18} />
                      <span>{copy.asrPanel.generateSubtitle}</span>
                    </div>
                  </div>
                  <p>{copy.asrPanel.subtitlesReady}</p>
                  <div className="subtitle-tools-row">
                    <span className={`subtitle-status ${activeSubtitle?.subtitleUrl ? 'ready' : subtitlePath ? 'cached' : 'idle'}`}>
                      {subtitleStatusLabel}
                    </span>
                    {canOpenSubtitleTools ? (
                      <details ref={subtitleActionsRef} className="subtitle-actions">
                        <summary className="subtitle-actions-summary" title={copy.asrPanel.subtitleTools} aria-label={copy.asrPanel.subtitleTools}>
                          <ChevronDown size={12} />
                          {copy.asrPanel.subtitleTools}
                        </summary>
                        <div className="subtitle-actions-menu" role="menu" aria-label={copy.asrPanel.subtitleToolsMenu}>
                          <button
                            className="subtitle-action-item"
                            type="button"
                            role="menuitem"
                            onClick={(event) => {
                              closeSubtitleActionsMenu(event)
                              openClipExportDialog()
                            }}
                            disabled={isExportingClip}
                          >
                            <ListVideo size={14} />
                            {copy.asrPanel.clipExport}
                          </button>
                          {canOpenSubtitleFolder ? (
                            <button
                              className="subtitle-action-item"
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                closeSubtitleActionsMenu(event)
                                void openSubtitleFolder()
                              }}
                            >
                              <FolderOpen size={14} />
                              {copy.asrPanel.openSubtitleFolder}
                            </button>
                          ) : null}
                          {canOpenSubtitleSrt ? (
                            <button
                              className="subtitle-action-item"
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                closeSubtitleActionsMenu(event)
                                void openSubtitleSrtFile()
                              }}
                            >
                              <FileText size={14} />
                              {copy.asrPanel.openSrtFile}
                            </button>
                          ) : null}
                          {canOpenSubtitleSrt ? (
                            <button
                              className="subtitle-action-item"
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                closeSubtitleActionsMenu(event)
                                void copySubtitleSrtPath()
                              }}
                            >
                              <Copy size={14} />
                              {copy.asrPanel.copySrtPath}
                            </button>
                          ) : null}
                          {canOpenSubtitleFolder ? (
                            <button
                              className="subtitle-action-item"
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                closeSubtitleActionsMenu(event)
                                void copySubtitleVttPath()
                              }}
                            >
                              <Copy size={14} />
                              {copy.asrPanel.copyVttPath}
                            </button>
                          ) : null}
                          {canOpenSubtitleFolder ? (
                            <button
                              className="subtitle-action-item"
                              type="button"
                              role="menuitem"
                              onClick={(event) => {
                                closeSubtitleActionsMenu(event)
                                void exportSubtitleSrtFile()
                              }}
                            >
                              <Download size={14} />
                              {copy.asrPanel.exportSrt}
                            </button>
                          ) : null}
                        </div>
                      </details>
                    ) : null}
                  </div>
                  {asrProgress ? (
                    <div className="progress-block">
                      <div className="progress-label">
                        <span>{asrProgress.message}</span>
                        <strong>{formatPercent(asrProgress.percent, copy.asrModelStatus.progressLabel)}</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.round((asrProgress.percent ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {asrNotice ? (
                    <div className={`asr-result ${asrNotice.success ? 'success' : 'failed'}`}>
                      {asrNotice.message}
                    </div>
                  ) : null}
                  <div className="asr-action-row">
                    <button
                      className="asr-action-button primary"
                      type="button"
                      onClick={generateSubtitle}
                      disabled={!canGenerateSubtitle}
                    >
                      <Sparkles size={16} />
                      {isAsrBusy ? copy.asrPanel.generatingSubtitle : copy.asrPanel.generateSubtitle}
                    </button>
                    <button
                      className="asr-action-button"
                      type="button"
                      onClick={translateSubtitle}
                      disabled={!canTranslateSubtitle}
                    >
                      <Languages size={16} />
                      {isTranslatingSubtitle
                        ? copy.asrPanel.translatingSubtitle
                        : copy.asrPanel.translateSubtitle(subtitleTargetLanguageLabel)}
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : null}

          {state.panelMode === 'subtitles' ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">{copy.panels.subtitlesKicker}</span>
                  <h2>{copy.panels.subtitlesTitle}</h2>
                </div>
                <Captions size={19} />
              </div>
              <div className="panel-empty">{copy.panels.noSubtitles}</div>
            </>
          ) : null}

          {state.panelMode === 'info' ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">{copy.panels.infoKicker}</span>
                  <h2>{copy.panels.infoTitle}</h2>
                </div>
                <Info size={19} />
              </div>
              {state.currentFile ? (
                <div className="info-stack">
                  <section className="info-card">
                    <div className="info-card-heading">
                      <FileText size={16} />
                      <span>{copy.panels.currentFile}</span>
                    </div>
                    <div className="info-hero">
                      <strong title={state.currentFile.name}>{state.currentFile.name}</strong>
                      <span>
                        {(mediaContainerName ?? mediaContainerLabel) || '--'} · {copy.panels.loadedToPlayer}
                      </span>
                    </div>
                    <div className="info-grid compact">
                      <div className="info-item">
                        <span>{copy.panels.containerFormat}</span>
                        <InfoValue value={mediaContainerLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.fileSize}</span>
                        <InfoValue value={mediaFileSizeLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.duration}</span>
                        <InfoValue value={mediaDurationLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.overallBitrate}</span>
                        <InfoValue value={mediaOverallBitrateLabel} />
                      </div>
                    </div>
                    <div className="info-grid">
                      <div className="info-item">
                        <span>{copy.panels.fullPath}</span>
                        <strong title={state.currentFile.path}>{state.currentFile.path}</strong>
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.mediaUrl}</span>
                        <strong title={state.currentFile.url}>{state.currentFile.url}</strong>
                      </div>
                    </div>
                    <div className="info-card-actions">
                      <button
                        className="settings-secondary-button info-card-more-button"
                        type="button"
                        onClick={() => setIsMediaDetailsDialogOpen(true)}
                        disabled={!mediaMetadata}
                      >
                        {copy.panels.moreDetails}
                      </button>
                    </div>
                  </section>

                  <section className="info-card">
                    <div className="info-card-heading">
                      <ListVideo size={16} />
                      <span>{copy.panels.videoStream}</span>
                    </div>
                    <div className="info-grid compact">
                      <div className="info-item">
                        <span>{copy.panels.resolution}</span>
                        <InfoValue value={mediaResolutionLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.frameRate}</span>
                        <InfoValue value={mediaFrameRateLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.videoCodec}</span>
                        <InfoValue value={mediaVideoCodecLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.displayAspectRatio}</span>
                        <InfoValue value={mediaAspectRatioLabel} />
                      </div>
                    </div>
                  </section>

                  <section className="info-card">
                    <div className="info-card-heading">
                      <AudioLines size={16} />
                      <span>{copy.panels.audioStream}</span>
                    </div>
                    <div className="info-grid compact">
                      <div className="info-item">
                        <span>{copy.panels.audioCodec}</span>
                        <InfoValue value={mediaAudioCodecLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.channels}</span>
                        <InfoValue value={mediaAudioChannelsLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.sampleRate}</span>
                        <InfoValue value={mediaAudioSampleRateLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.audioBitrate}</span>
                        <InfoValue value={mediaAudioBitrateLabel} />
                      </div>
                    </div>
                  </section>

                  <section className="info-card">
                    <div className="info-card-heading">
                      <Clock size={16} />
                      <span>{copy.panels.playbackState}</span>
                    </div>
                    <div className="info-grid compact">
                      <div className="info-item">
                        <span>{copy.controls.playbackPosition}</span>
                        <InfoValue value={playbackPositionInfoLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.controls.playbackSpeed}</span>
                        <InfoValue value={playbackSpeedInfoLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.controls.volume}</span>
                        <InfoValue value={playbackVolumeInfoLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.asrPanel.cacheState}</span>
                        <InfoValue value={subtitleStatusLabel} />
                      </div>
                    </div>
                  </section>

                  <section className="info-card">
                    <div className="info-card-heading">
                      <Captions size={16} />
                      <span>{copy.panels.subtitleCache}</span>
                    </div>
                    <div className="info-grid compact">
                      <div className="info-item">
                        <span>{copy.panels.vtt}</span>
                        <InfoValue value={subtitleVttStatusLabel} tooltip={subtitlePath ?? subtitleVttStatusLabel} />
                      </div>
                      <div className="info-item">
                        <span>{copy.panels.srt}</span>
                        <InfoValue value={subtitleSrtStatusLabel} tooltip={subtitleSrtPath ?? subtitleSrtStatusLabel} />
                      </div>
                    </div>
                  </section>
                </div>
              ) : (
                <div className="panel-empty">{copy.panels.noMedia}</div>
              )}
            </>
          ) : null}
          </div>
        </aside>
      </main>

      {isSettingsDialogOpen ? (
        <SettingsDialog
          copy={copy}
          settings={appSettings}
          asrStatus={asrStatus}
          runtimeSetupMessage={runtimeSetupMessage}
          isDetectingWhisperBinary={isDetectingWhisperBinary}
          isSelectingWhisperBinary={isSelectingWhisperBinary}
          initialSectionId={initialSettingsSectionId}
          patchSettingsSection={patchAppSettingsSection}
          onClose={() => setIsSettingsDialogOpen(false)}
          onAutoDetectWhisperBinary={autoDetectWhisperBinary}
          onOpenAsrPanel={() => {
            setIsSettingsDialogOpen(false)
            openPanelMode('asr')
          }}
          onPickDefaultFolder={pickDefaultFolder}
          onPickCaptureFolder={pickCaptureFolder}
          onSelectWhisperBinary={selectWhisperBinary}
          onResetDefaults={resetAppSettings}
        />
      ) : null}

      {isClipExportDialogOpen ? (
        <ClipExportDialog
          copy={copy}
          hasSubtitle={hasClipExportSubtitle}
          initialLengthSeconds={appSettings.capture.clipExportLengthSeconds}
          initialMode={appSettings.capture.clipExportMode}
          onClose={() => setIsClipExportDialogOpen(false)}
          onConfirm={confirmClipExport}
        />
      ) : null}

      {isDownloadDialogOpen && recommendedModelManifest ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isDownloadingModel) {
              setIsDownloadDialogOpen(false)
            }
          }}
        >
          <section
            ref={downloadDialogRef}
            className="download-dialog"
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-dialog-title"
            aria-describedby="download-dialog-description"
          >
            <div className="download-dialog-header">
              <div>
                <span className="panel-kicker">{copy.asrPanel.modelSource}</span>
                <h2 id="download-dialog-title">{copy.downloadDialog.title}</h2>
              </div>
              <button
                className="mini-tool-button"
                type="button"
                onClick={() => setIsDownloadDialogOpen(false)}
                title={copy.downloadDialog.close}
                disabled={isDownloadingModel}
              >
                <X size={14} />
              </button>
            </div>

            <p id="download-dialog-description" className="download-dialog-copy">
              {copy.downloadDialog.description(
                recommendedModelManifest.fileName,
                formatBytes(recommendedModelManifest.expectedSizeBytes)
              )}
            </p>

            <div className="download-source-grid">
              {recommendedModelSources.map((source) => {
                const isPreferredSource = source.id === preferredModelSourceId

                return (
                  <button
                    className={`download-source-option ${isPreferredSource ? 'is-preferred' : ''}`}
                    key={source.id}
                    type="button"
                    onClick={() => void downloadRecommendedModel(source.id)}
                    disabled={isDownloadingModel}
                    aria-label={copy.downloadDialog.sourceAria(source.name)}
                  >
                    <span className="download-source-icon">
                      <CloudDownload size={20} />
                    </span>
                    <span className="download-source-copy">
                      <span className="download-source-heading">
                        <strong>
                          {source.id === 'modelscope'
                            ? copy.downloadDialog.sourceDomestic
                            : copy.downloadDialog.sourceInternational}
                        </strong>
                        {isPreferredSource ? <span className="download-source-badge">{copy.downloadDialog.defaultBadge}</span> : null}
                      </span>
                      <span>{source.description}</span>
                      <small>
                        {source.region} · {source.name}
                      </small>
                    </span>
                  </button>
                )
              })}
            </div>
          </section>
        </div>
      ) : null}

      {isMediaDetailsDialogOpen ? (
        <MediaDetailsDialog
          copy={copy}
          metadata={mediaMetadata}
          onClose={() => setIsMediaDetailsDialogOpen(false)}
        />
      ) : null}
    </div>
  )
}
