import { useEffect, useRef, useState, type ReactElement } from 'react'
import {
  AudioLines,
  Captions,
  Clock,
  CloudDownload,
  Download,
  FileText,
  FolderOpen,
  ListVideo,
  Maximize2,
  PanelRight,
  Pause,
  Play,
  RefreshCcw,
  Settings,
  SkipBack,
  SkipForward,
  Sparkles,
  Volume2,
  VolumeX,
  X
} from 'lucide-react'
import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleResult,
  MediaFile
} from '../../../shared/media-types'
import { initialPlayerState, type PanelMode, type PlayerState } from './player-state'
import { buildAsrModelViewState } from './asr-model-view-state'
import { clamp, formatTime } from '../lib/time'

const SEEK_STEP_SECONDS = 5

function getPlayFailureMessage(error: unknown): string | null {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return null
  }

  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return `播放器启动失败：${message}`
}

function getMediaErrorMessage(video: HTMLVideoElement): string | null {
  const error = video.error

  if (!error) {
    return null
  }

  if (error.code === MediaError.MEDIA_ERR_ABORTED) {
    return null
  }

  if (error.code === MediaError.MEDIA_ERR_NETWORK) {
    return `媒体读取失败：${error.message || '文件读取过程中发生网络/文件系统错误。'}`
  }

  if (error.code === MediaError.MEDIA_ERR_DECODE) {
    return `视频解码失败：${error.message || '当前 Electron/Chromium 解码器无法继续解码这个文件。'}`
  }

  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return `媒体源不受支持或无法读取：${error.message || '请确认文件路径、封装格式和编码是否可用。'}`
  }

  return `播放失败：${error.message || `未知媒体错误 ${error.code}。`}`
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

function formatPercent(value: number | null | undefined): string {
  if (value == null) {
    return '处理中'
  }

  return `${Math.round(value * 100)}%`
}

export function App(): ReactElement {
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const [state, setState] = useState<PlayerState>(initialPlayerState)
  const [asrStatus, setAsrStatus] = useState<AsrRuntimeStatus | null>(null)
  const [asrProgress, setAsrProgress] = useState<AsrJobProgress | null>(null)
  const [asrResult, setAsrResult] = useState<AsrSubtitleResult | null>(null)
  const [activeSubtitle, setActiveSubtitle] = useState<AsrSubtitleResult | null>(null)
  const [downloadProgress, setDownloadProgress] = useState<AsrModelDownloadProgress | null>(null)
  const [isAsrBusy, setIsAsrBusy] = useState(false)
  const [isDownloadingModel, setIsDownloadingModel] = useState(false)
  const [isDetectingWhisperBinary, setIsDetectingWhisperBinary] = useState(false)
  const [isSelectingWhisperBinary, setIsSelectingWhisperBinary] = useState(false)
  const [runtimeSetupMessage, setRuntimeSetupMessage] = useState<{ success: boolean; message: string } | null>(null)
  const [isDownloadDialogOpen, setIsDownloadDialogOpen] = useState(false)
  const isSidePanelVisible = state.panelMode !== 'none'
  const installedModelCount = asrStatus?.installedModels.length ?? 0
  const canDownloadRecommendedModel = Boolean(asrStatus && !isDownloadingModel)
  const canGenerateSubtitle = Boolean(state.currentFile && asrStatus?.available && !isAsrBusy && !isDownloadingModel)
  const subtitlePath = activeSubtitle?.subtitlePath ?? asrResult?.subtitlePath ?? null
  const subtitleSrtPath = activeSubtitle?.subtitleSrtPath ?? asrResult?.subtitleSrtPath ?? null
  const canOpenSubtitleFolder = Boolean(subtitlePath)
  const canOpenSubtitleSrt = Boolean(subtitleSrtPath)
  const recommendedModelManifest = asrStatus?.recommendedModelManifest ?? null
  const modelViewState = recommendedModelManifest
    ? buildAsrModelViewState({
        recommendedManifest: recommendedModelManifest,
        installedModels: asrStatus?.installedModels ?? [],
        isDownloadingModel,
        downloadProgress,
        hasWhisperRuntime: Boolean(asrStatus?.binaryPath),
        hasFfmpegRuntime: Boolean(asrStatus?.ffmpegPath)
      })
    : null

  const loadFiles = (files: MediaFile[]): void => {
    if (files.length === 0) {
      return
    }

    setActiveSubtitle(null)
    setAsrProgress(null)
    setAsrResult(null)

    setState((current) => {
      const playlist = mergePlaylist(current.playlist, files)
      const currentFile = getPlaylistFileByPath(playlist, files[0])
      return {
        ...current,
        playlist,
        currentFile,
        currentTime: 0,
        duration: 0,
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

  const togglePanelMode = (panelMode: PanelMode): void => {
    setState((current) => ({
      ...current,
      panelMode: current.panelMode === panelMode ? 'none' : panelMode
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
    const video = videoRef.current
    if (!video || !state.currentFile) {
      return
    }

    if (video.paused) {
      try {
        await video.play()
      } catch (error) {
        const message = getPlayFailureMessage(error)
        if (message) {
          setPlaybackError(message)
        }
      }
    } else {
      video.pause()
    }
  }

  const seekBy = (seconds: number): void => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.currentTime = clamp(video.currentTime + seconds, 0, video.duration || 0)
  }

  const selectFile = (file: MediaFile): void => {
    setActiveSubtitle(null)
    setAsrProgress(null)
    setAsrResult(null)

    setState((current) => ({
      ...current,
      currentFile: file,
      currentTime: 0,
      duration: 0,
      isPlaying: false,
      autoPlayRequestId: current.autoPlayRequestId + 1,
      error: null
    }))
  }

  const playAdjacent = (direction: -1 | 1): void => {
    if (!state.currentFile || state.playlist.length === 0) {
      return
    }

    const currentIndex = state.playlist.findIndex((item) => item.path === state.currentFile?.path)
    const nextIndex = clamp(currentIndex + direction, 0, state.playlist.length - 1)
    selectFile(state.playlist[nextIndex])
  }

  const toggleMute = (): void => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.muted = !video.muted
  }

  const toggleFullscreen = async (): Promise<void> => {
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
    const message = getMediaErrorMessage(video)

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

  const downloadRecommendedModel = async (sourceId: AsrModelSourceId): Promise<void> => {
    if (!asrStatus) {
      return
    }

    setIsDownloadDialogOpen(false)
    setIsDownloadingModel(true)
    setDownloadProgress(null)
    setAsrResult(null)

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
    setAsrResult(null)
    setAsrProgress({
      stage: 'checking',
      percent: 0,
      message: '正在创建本地字幕任务。'
    })

    try {
      const result = await window.aiv.generateAsrSubtitle({
        mediaPath: state.currentFile.path,
        modelId: asrStatus?.recommendedModelManifest.id,
        language: 'auto'
      })

      setAsrResult(result)

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

    await window.aiv.showItemInFolder(subtitlePath)
  }

  const openSubtitleSrtFile = async (): Promise<void> => {
    if (!subtitleSrtPath) {
      return
    }

    await window.aiv.showItemInFolder(subtitleSrtPath)
  }

  useEffect(() => {
    const video = videoRef.current
    if (!video) {
      return
    }

    video.volume = state.volume
    video.playbackRate = state.playbackRate
  }, [state.volume, state.playbackRate])

  useEffect(() => {
    const video = videoRef.current
    if (!video || !state.currentFile) {
      return
    }

    video.currentTime = 0
    video.playbackRate = state.playbackRate
    video.volume = state.volume

    const playTimer = window.setTimeout(() => {
      void video.play().catch((error: unknown) => {
        const message = getPlayFailureMessage(error)
        if (message) {
          setPlaybackError(message)
        }
      })
    }, 0)

    return () => window.clearTimeout(playTimer)
  }, [state.currentFile?.id, state.autoPlayRequestId])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.target instanceof HTMLInputElement) {
        return
      }

      if (event.code === 'Space') {
        event.preventDefault()
        void togglePlay()
      }
      if (event.code === 'ArrowLeft') seekBy(-SEEK_STEP_SECONDS)
      if (event.code === 'ArrowRight') seekBy(SEEK_STEP_SECONDS)
      if (event.code === 'KeyO' && (event.metaKey || event.ctrlKey)) void openFiles()
      if (event.code === 'KeyM') toggleMute()
      if (event.code === 'KeyF') void toggleFullscreen()
      if (event.code === 'KeyL') {
        togglePanelMode('playlist')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  })

  useEffect(() => {
    void refreshAsrStatus()
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
    if (!activeSubtitle?.subtitleUrl || !videoRef.current) {
      return
    }

    const timer = window.setTimeout(() => {
      const video = videoRef.current

      if (!video) {
        return
      }

      for (const track of Array.from(video.textTracks)) {
        track.mode = track.label === 'ASR 字幕' ? 'showing' : 'disabled'
      }
    }, 0)

    return () => window.clearTimeout(timer)
  }, [activeSubtitle?.subtitleUrl])

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
          <span>AIVPlayer</span>
        </div>
        <nav className="top-actions" aria-label="Primary">
          <button className="tool-button" type="button" onClick={openFiles} title="Open media files">
            <FolderOpen size={17} />
          </button>
          <button
            className={`tool-button ${state.panelMode === 'playlist' ? 'active' : ''}`}
            type="button"
            onClick={() => togglePanelMode('playlist')}
            title="Toggle playlist"
            aria-pressed={state.panelMode === 'playlist'}
          >
            <PanelRight size={17} />
          </button>
          <button
            className={`tool-button ${state.panelMode === 'asr' ? 'active' : ''}`}
            type="button"
            onClick={() => togglePanelMode('asr')}
            title="ASR subtitles"
            aria-pressed={state.panelMode === 'asr'}
          >
            <Sparkles size={17} />
          </button>
          <button
            className={`tool-button ${state.panelMode === 'info' ? 'active' : ''}`}
            type="button"
            title="Settings"
            onClick={() => togglePanelMode('info')}
            aria-pressed={state.panelMode === 'info'}
          >
            <Settings size={17} />
          </button>
        </nav>
      </header>

      <main className={`workspace ${isSidePanelVisible ? 'with-side-panel' : 'side-panel-collapsed'}`}>
        <section className="stage" aria-label="Video stage">
          <div className="video-frame">
            {state.currentFile ? (
              <video
                ref={videoRef}
                className="video-surface"
                src={state.currentFile.url}
                preload="metadata"
                onPlay={() => setState((current) => ({ ...current, isPlaying: true }))}
                onPlaying={clearPlaybackError}
                onCanPlay={clearPlaybackError}
                onPause={() => setState((current) => ({ ...current, isPlaying: false }))}
                onLoadedMetadata={(event) => {
                  const duration = event.currentTarget.duration || 0
                  setState((current) => ({ ...current, duration, error: null }))
                }}
                onTimeUpdate={(event) => {
                  const currentTime = event.currentTarget.currentTime
                  setState((current) => ({ ...current, currentTime, error: null }))
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
              >
                {activeSubtitle?.subtitleUrl ? (
                  <track
                    key={activeSubtitle.subtitleUrl}
                    kind="subtitles"
                    src={activeSubtitle.subtitleUrl}
                    srcLang="auto"
                    label="ASR 字幕"
                    default
                  />
                ) : null}
              </video>
            ) : (
              <div className="empty-state">
                <div className="empty-icon">
                  <AudioLines size={46} />
                </div>
                <h1>AIVPlayer</h1>
                <p>拖入视频文件，或从本机选择媒体开始播放。</p>
                <button className="primary-action" type="button" onClick={openFiles}>
                  <FolderOpen size={18} />
                  打开视频
                </button>
              </div>
            )}
          </div>

          {state.error ? (
            <div className="status-banner">
              <span>{state.error}</span>
            </div>
          ) : null}

          <div className="control-deck">
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
                aria-label="Playback position"
              />
              <span>{formatTime(state.duration)}</span>
            </div>

            <div className="controls-row">
              <div className="control-group">
                <button className="round-button" type="button" onClick={() => playAdjacent(-1)} title="Previous">
                  <SkipBack size={18} />
                </button>
                <button className="round-button primary" type="button" onClick={togglePlay} title="Play or pause">
                  {state.isPlaying ? <Pause size={22} /> : <Play size={22} />}
                </button>
                <button className="round-button" type="button" onClick={() => playAdjacent(1)} title="Next">
                  <SkipForward size={18} />
                </button>
              </div>

              <div className="control-group wide">
                <button className="round-button" type="button" onClick={toggleMute} title="Mute">
                  {state.muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
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
                    setState((current) => ({ ...current, volume: nextVolume, muted: nextVolume === 0 }))
                  }}
                  aria-label="Volume"
                />
              </div>

              <div className="control-group">
                <select
                  className="speed-select"
                  value={state.playbackRate}
                  onChange={(event) => {
                    const playbackRate = Number(event.currentTarget.value)
                    if (videoRef.current) {
                      videoRef.current.playbackRate = playbackRate
                    }
                    setState((current) => ({ ...current, playbackRate }))
                  }}
                  aria-label="Playback speed"
                >
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => (
                    <option key={speed} value={speed}>
                      {speed}x
                    </option>
                  ))}
                </select>
                <button className="round-button" type="button" onClick={toggleFullscreen} title="Fullscreen">
                  <Maximize2 size={18} />
                </button>
              </div>
            </div>
          </div>
        </section>

        <aside
          className={`side-panel panel-${state.panelMode}`}
          aria-label="Side panel"
        >
          <div className="panel-switcher" role="tablist" aria-label="Panel views">
            <button
              className={`panel-tab ${state.panelMode === 'playlist' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.panelMode === 'playlist'}
              onClick={() => openPanelMode('playlist')}
            >
              <ListVideo size={15} />
              <span>播放列表</span>
            </button>
            <button
              className={`panel-tab ${state.panelMode === 'asr' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.panelMode === 'asr'}
              onClick={() => openPanelMode('asr')}
            >
              <Sparkles size={15} />
              <span>ASR</span>
            </button>
            <button
              className={`panel-tab ${state.panelMode === 'info' ? 'active' : ''}`}
              type="button"
              role="tab"
              aria-selected={state.panelMode === 'info'}
              onClick={() => openPanelMode('info')}
            >
              <Settings size={15} />
              <span>信息</span>
            </button>
          </div>

          <div className={`panel-content panel-content-${state.panelMode}`}>
          {state.panelMode === 'playlist' ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Queue</span>
                  <h2>播放列表</h2>
                </div>
                <ListVideo size={19} />
              </div>
              <div className="playlist">
                {state.playlist.length === 0 ? (
                  <div className="panel-empty">还没有媒体文件。</div>
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
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">AI Subtitles</span>
                  <h2>本地 ASR 字幕</h2>
                </div>
                <Captions size={19} />
              </div>
              <div className="asr-stack">
                <div className="asr-card open">
                  <div className="asr-card-heading">
                    <div className="asr-card-title">
                      <Sparkles size={18} />
                      <span>ASR 引擎状态</span>
                    </div>
                    <button className="mini-tool-button" type="button" onClick={refreshAsrStatus} title="刷新 ASR 引擎状态">
                      <RefreshCcw size={14} />
                    </button>
                  </div>
                  <p>{asrStatus?.message ?? '正在检测 ASR 引擎...'}</p>
                  <div className="asr-meta">
                    <span>
                      <Clock size={14} />
                      {installedModelCount} 个模型文件
                    </span>
                    <span>{asrStatus?.available ? '引擎就绪' : '引擎未就绪'}</span>
                  </div>
                  <div className="asr-runtime-grid">
                    <span>ASR 引擎 whisper.cpp</span>
                    <strong>{asrStatus?.binaryPath ? '已找到' : '未找到'}</strong>
                    <span>ffmpeg</span>
                    <strong>{asrStatus?.ffmpegPath ? '已找到' : '未找到'}</strong>
                  </div>
                  {runtimeSetupMessage ? (
                    <div className={`asr-result ${runtimeSetupMessage.success ? 'success' : 'failed'}`}>
                      {runtimeSetupMessage.message}
                    </div>
                  ) : null}
                  <div className="asr-action-row">
                    <button
                      className="asr-action-button"
                      type="button"
                      onClick={autoDetectWhisperBinary}
                      disabled={isDetectingWhisperBinary || isSelectingWhisperBinary}
                      title="自动检测 whisper.cpp"
                      aria-label="自动检测 whisper.cpp"
                    >
                      <RefreshCcw size={16} />
                      {isDetectingWhisperBinary ? '检测中' : '自动检测'}
                    </button>
                    <button
                      className="asr-action-button"
                      type="button"
                      onClick={selectWhisperBinary}
                      disabled={isSelectingWhisperBinary || isDetectingWhisperBinary}
                      title="选择 whisper.cpp 可执行文件"
                      aria-label={asrStatus?.binaryPath ? '更换 ASR 引擎' : '选择 whisper.cpp 可执行文件'}
                    >
                      <FolderOpen size={16} />
                      {isSelectingWhisperBinary ? '选择中' : asrStatus?.binaryPath ? '更换引擎' : '选择文件'}
                    </button>
                  </div>
                </div>

                <div className="asr-card open">
                  <div className="asr-card-heading">
                    <div className="asr-card-title">
                      <Download size={18} />
                      <span>模型文件</span>
                    </div>
                    <span className={`asr-status-pill ${modelViewState?.installState ?? 'missing'}`}>
                      {modelViewState?.statusLabel ?? '检测中'}
                    </span>
                  </div>
                  <p>{modelViewState?.description ?? '正在检测本地 ASR 模型。'}</p>
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
                        <span>{recommendedModelManifest?.name ?? asrStatus?.recommendedModel ?? '未安装推荐模型'}</span>
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
                        <strong>{formatPercent(downloadProgress.percent)}</strong>
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
                    {modelViewState?.actionLabel ?? '下载推荐模型'}
                  </button>
                </div>

                <div className="asr-card open">
                  <div className="asr-card-heading">
                    <div className="asr-card-title">
                      <Captions size={18} />
                      <span>生成字幕</span>
                    </div>
                    {canOpenSubtitleFolder ? (
                      <button
                        className="mini-tool-button"
                        type="button"
                        onClick={openSubtitleFolder}
                        title="打开字幕文件夹"
                        aria-label="打开字幕文件夹"
                      >
                        <FolderOpen size={14} />
                      </button>
                    ) : null}
                  </div>
                  <p>VTT / SRT / auto / 本地缓存</p>
                  {asrProgress ? (
                    <div className="progress-block">
                      <div className="progress-label">
                        <span>{asrProgress.message}</span>
                        <strong>{formatPercent(asrProgress.percent)}</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{ width: `${Math.round((asrProgress.percent ?? 0) * 100)}%` }}
                        />
                      </div>
                    </div>
                  ) : null}
                  {asrResult ? (
                    <div className={`asr-result ${asrResult.success ? 'success' : 'failed'}`}>
                      {asrResult.message}
                    </div>
                  ) : null}
                  {asrResult?.success && canOpenSubtitleSrt ? (
                    <button className="asr-action-button" type="button" onClick={openSubtitleSrtFile}>
                      <FileText size={16} />
                      打开 SRT 文件
                    </button>
                  ) : null}
                  <button
                    className="asr-action-button primary"
                    type="button"
                    onClick={generateSubtitle}
                    disabled={!canGenerateSubtitle}
                  >
                    <Sparkles size={16} />
                    {isAsrBusy ? '生成中' : subtitlePath ? '重新生成当前视频字幕' : '生成当前视频字幕'}
                  </button>
                </div>
              </div>
            </>
          ) : null}

          {state.panelMode === 'subtitles' ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Subtitles</span>
                  <h2>字幕轨道</h2>
                </div>
                <Captions size={19} />
              </div>
              <div className="panel-empty">还没有载入字幕轨道。</div>
            </>
          ) : null}

          {state.panelMode === 'info' ? (
            <>
              <div className="panel-header">
                <div>
                  <span className="panel-kicker">Info</span>
                  <h2>媒体信息</h2>
                </div>
                <Settings size={19} />
              </div>
              <div className="panel-empty">
                {state.currentFile ? state.currentFile.name : '还没有媒体文件。'}
              </div>
            </>
          ) : null}
          </div>
        </aside>
      </main>

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
            className="download-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="download-dialog-title"
            aria-describedby="download-dialog-description"
          >
            <div className="download-dialog-header">
              <div>
                <span className="panel-kicker">Model Source</span>
                <h2 id="download-dialog-title">选择 ASR 模型下载源</h2>
              </div>
              <button
                className="mini-tool-button"
                type="button"
                onClick={() => setIsDownloadDialogOpen(false)}
                title="关闭下载源选择"
                disabled={isDownloadingModel}
              >
                <X size={14} />
              </button>
            </div>

            <p id="download-dialog-description" className="download-dialog-copy">
              中国大陆网络建议走阿里云 ModelScope；海外用户或已经配置稳定国际代理时，走 Hugging Face。
              两个源下载的是同一个 {recommendedModelManifest.fileName}，约 {formatBytes(recommendedModelManifest.expectedSizeBytes)}。
            </p>

            <div className="download-source-grid">
              {recommendedModelManifest.sources.map((source) => (
                <button
                  className="download-source-option"
                  key={source.id}
                  type="button"
                  onClick={() => void downloadRecommendedModel(source.id)}
                  disabled={isDownloadingModel}
                  aria-label={`从 ${source.name} 下载推荐 ASR 模型`}
                >
                  <span className="download-source-icon">
                    <CloudDownload size={20} />
                  </span>
                  <span className="download-source-copy">
                    <strong>
                      {source.id === 'modelscope' ? '国内下载 ModelScope' : '国际下载 Hugging Face'}
                    </strong>
                    <span>{source.description}</span>
                    <small>
                      {source.region} · {source.name}
                    </small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  )
}
