import type { SyntheticEvent } from 'react'
import { AudioLines, FolderOpen } from 'lucide-react'
import { resolvePlaybackStartTime } from './playback-progress'
import { useAppContext } from './app-context'

export function VideoSurface(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  if (!state.currentFile) {
    return <div className="empty-state"><div className="empty-icon"><AudioLines size={46} /></div><h1>{copy.emptyState.title}</h1><p>{copy.emptyState.description}</p><button className="primary-action" type="button" onClick={app.openFiles}><FolderOpen size={18} />{copy.emptyState.openVideo}</button></div>
  }
  const onLoadedMetadata = (event: SyntheticEvent<HTMLVideoElement>): void => {
    const video = event.currentTarget
    const duration = video.duration || 0
    const currentTime = video.currentTime
    const resumeTime = resolvePlaybackStartTime(currentTime, duration)
    if (Math.abs(currentTime - resumeTime) > 0.25) video.currentTime = resumeTime
    app.setState((current) => ({ ...current, duration, currentTime: resumeTime, videoWidth: video.videoWidth || 0, videoHeight: video.videoHeight || 0, error: null }))
    app.updatePlaybackHistoryDuration(duration)
    app.persistPlaybackProgress(resumeTime, true)
  }
  return <video ref={app.videoRef} className="video-surface" style={state.videoWidth > 0 && state.videoHeight > 0 ? { aspectRatio: `${state.videoWidth} / ${state.videoHeight}` } : undefined} src={state.currentFile.url} preload="metadata" onClick={app.handleVideoClick} onDoubleClick={app.handleVideoDoubleClick} onPlay={() => app.setState((current) => ({ ...current, isPlaying: true }))} onPlaying={app.clearPlaybackError} onCanPlay={app.clearPlaybackError} onPause={(event) => { const currentTime = event.currentTarget.currentTime; app.setState((current) => ({ ...current, isPlaying: false })); app.persistPlaybackProgress(currentTime, true) }} onEnded={() => { app.playbackEndedRef.current = true; app.setState((current) => ({ ...current, isPlaying: false })); app.persistPlaybackProgress(0, true) }} onLoadedMetadata={onLoadedMetadata} onTimeUpdate={(event) => { const currentTime = event.currentTarget.currentTime; app.setState((current) => ({ ...current, currentTime, error: null })); app.persistPlaybackProgress(currentTime) }} onVolumeChange={(event) => { const { volume, muted } = event.currentTarget; app.setState((current) => ({ ...current, volume, muted })) }} onError={app.handleMediaError} controls={false} />
}
