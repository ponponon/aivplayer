import { Columns2, FolderOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { AppSelect } from '../../../shared/app-select'
import { clampComparisonTime } from '../../../shared/playback-comparison'
import { useAppContext } from './app-context'
import { VideoSurface } from './video-surface'

export function PlaybackComparison(): React.ReactElement {
  const app = useAppContext()
  const secondaryVideoRef = useRef<HTMLVideoElement | null>(null)
  const [secondaryDuration, setSecondaryDuration] = useState(0)
  const [secondaryError, setSecondaryError] = useState(false)
  const comparisonCandidates = app.state.playlist.filter((file) => file.path !== app.state.currentFile?.path)
  const comparisonFile = comparisonCandidates.find((file) => file.path === app.comparisonFilePath) ?? comparisonCandidates[0] ?? null
  const shouldPlaySecondary = app.state.isPlaying || Boolean(app.videoRef.current && !app.videoRef.current.paused)

  useEffect(() => {
    const nextPath = comparisonFile?.path ?? null
    if (nextPath !== app.comparisonFilePath) app.setComparisonFilePath(nextPath)
  }, [app.comparisonFilePath, app.setComparisonFilePath, comparisonFile?.path])

  useEffect(() => {
    setSecondaryDuration(0)
    setSecondaryError(false)
    const video = secondaryVideoRef.current
    if (!video) return
    video.pause()
    video.load()
  }, [comparisonFile?.path, comparisonFile?.url])

  useEffect(() => {
    const video = secondaryVideoRef.current
    if (!video || !comparisonFile || video.readyState < 1) return
    const nextTime = clampComparisonTime(app.state.currentTime, app.state.duration, secondaryDuration)
    if (Math.abs(video.currentTime - nextTime) > 0.08) video.currentTime = nextTime
    if (shouldPlaySecondary && video.paused && !video.ended) void video.play().catch(() => undefined)
  }, [app.state.currentTime, app.state.duration, comparisonFile?.path, secondaryDuration, shouldPlaySecondary])

  useEffect(() => {
    const video = secondaryVideoRef.current
    if (!video || !comparisonFile || secondaryError) return
    video.playbackRate = app.state.playbackRate
    if (shouldPlaySecondary) {
      void video.play().catch(() => undefined)
    } else {
      video.pause()
    }
  }, [app.state.playbackRate, comparisonFile?.path, secondaryError, shouldPlaySecondary])

  useEffect(() => {
    let active = true
    let timer: number | null = null
    const reconcilePlayingState = (): void => {
      if (!active) return
      const primaryVideo = app.videoRef.current
      const secondaryVideo = secondaryVideoRef.current
      if (primaryVideo && secondaryVideo && comparisonFile && !secondaryError && secondaryVideo.readyState >= 1) {
        secondaryVideo.muted = true
        secondaryVideo.playbackRate = app.state.playbackRate
        if (primaryVideo.paused) {
          if (!secondaryVideo.paused) secondaryVideo.pause()
        } else if (secondaryVideo.paused && !secondaryVideo.ended) {
          void secondaryVideo.play().catch(() => undefined)
        }
      }
      timer = window.setTimeout(reconcilePlayingState, 250)
    }
    reconcilePlayingState()
    return () => {
      active = false
      if (timer != null) window.clearTimeout(timer)
    }
  }, [app.state.playbackRate, app.videoRef, comparisonFile, secondaryError])

  const handleSecondaryLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    setSecondaryDuration(duration)
    video.muted = true
    video.playbackRate = app.state.playbackRate
    const nextTime = clampComparisonTime(app.state.currentTime, app.state.duration, duration)
    if (Math.abs(video.currentTime - nextTime) > 0.08) video.currentTime = nextTime
    if (shouldPlaySecondary) void video.play().catch(() => undefined)
  }

  const handleSecondaryCanPlay = (event: React.SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    video.muted = true
    video.playbackRate = app.state.playbackRate
    if (shouldPlaySecondary && video.paused) void video.play().catch(() => undefined)
  }

  const handleSecondaryEnded = (): void => {
    const primaryVideo = app.videoRef.current
    if (!primaryVideo || primaryVideo.ended) return
    primaryVideo.pause()
    app.syncPlaybackState(primaryVideo)
  }

  return (
    <div className="playback-comparison" data-testid="playback-comparison">
      <div className="playback-comparison-toolbar">
        <div className="playback-comparison-heading">
          <Columns2 size={15} aria-hidden="true" />
          <strong>{app.copy.topbar.compareMode}</strong>
          <span>{app.copy.topbar.compareSyncStatus}</span>
        </div>
        <label className="playback-comparison-target">
          <span>{app.copy.topbar.compareTarget}</span>
          <AppSelect
            value={comparisonFile?.path ?? ''}
            data-testid="playback-comparison-target"
            aria-label={app.copy.topbar.compareTarget}
            disabled={comparisonCandidates.length === 0}
            onChange={(event) => app.setComparisonFilePath(event.currentTarget.value || null)}
          >
            {comparisonCandidates.map((file) => <option key={file.path} value={file.path}>{file.name}</option>)}
          </AppSelect>
        </label>
      </div>
      {comparisonFile ? (
        <div className="playback-comparison-grid">
          <article className="playback-comparison-pane">
            <div className="playback-comparison-pane-heading"><span>{app.copy.topbar.comparePrimary}</span><strong title={app.state.currentFile?.name}>{app.state.currentFile?.name ?? '—'}</strong></div>
            <div className="playback-comparison-pane-surface"><VideoSurface /></div>
          </article>
          <article className="playback-comparison-pane">
            <div className="playback-comparison-pane-heading"><span>{app.copy.topbar.compareSecondary}</span><strong title={comparisonFile.name}>{comparisonFile.name}</strong></div>
            <div className="playback-comparison-pane-surface">
              <video
                ref={secondaryVideoRef}
                className="comparison-secondary-video"
                data-testid="playback-comparison-secondary"
                src={comparisonFile.url}
                preload="metadata"
                autoPlay={shouldPlaySecondary}
                muted
                playsInline
                controls={false}
                onLoadedMetadata={handleSecondaryLoadedMetadata}
                onCanPlay={handleSecondaryCanPlay}
                onError={() => setSecondaryError(true)}
                onEnded={handleSecondaryEnded}
              />
              {secondaryError ? <div className="playback-comparison-error" role="alert">{app.copy.topbar.compareMediaError}</div> : null}
            </div>
          </article>
        </div>
      ) : (
        <div className="playback-comparison-empty">
          <p>{app.copy.topbar.compareRequiresTwoFiles}</p>
          <button className="primary-action" type="button" onClick={app.openFiles}><FolderOpen size={16} />{app.copy.emptyState.openVideo}</button>
        </div>
      )}
    </div>
  )
}
