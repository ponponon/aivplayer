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
  }, [app.state.currentTime, app.state.duration, comparisonFile?.path, secondaryDuration])

  useEffect(() => {
    const video = secondaryVideoRef.current
    if (!video || !comparisonFile || secondaryError) return
    video.playbackRate = app.state.playbackRate
    if (app.state.isPlaying) {
      void video.play().catch(() => setSecondaryError(true))
    } else {
      video.pause()
    }
  }, [app.state.isPlaying, app.state.playbackRate, comparisonFile?.path, secondaryError])

  const handleSecondaryLoadedMetadata = (event: React.SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    const duration = Number.isFinite(video.duration) ? video.duration : 0
    setSecondaryDuration(duration)
    video.playbackRate = app.state.playbackRate
    const nextTime = clampComparisonTime(app.state.currentTime, app.state.duration, duration)
    if (Math.abs(video.currentTime - nextTime) > 0.08) video.currentTime = nextTime
    if (app.state.isPlaying) void video.play().catch(() => setSecondaryError(true))
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
                muted
                playsInline
                controls={false}
                onLoadedMetadata={handleSecondaryLoadedMetadata}
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
