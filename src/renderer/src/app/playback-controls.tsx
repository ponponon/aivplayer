import { ChevronDown, Fullscreen, Minimize2, Pause, Play, SkipBack, SkipForward, Square, Volume2, VolumeX } from 'lucide-react'
import { formatTime } from '../lib/time'
import { QuickSubtitleButton } from './quick-subtitle-button'
import { useAppContext } from './app-context'

function PlaybackPrimaryControls(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  return <div className="controls-primary"><div className="control-group transport-group"><button className="round-button" type="button" onClick={() => app.playAdjacent(-1)} title={copy.controls.previous}><SkipBack size={16} /></button><button className="round-button primary" type="button" onClick={app.togglePlay} title={`${state.isPlaying ? copy.controls.pause : copy.controls.play} (Space)`} aria-keyshortcuts="Space">{state.isPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button className="round-button" type="button" onClick={() => app.playAdjacent(1)} title={copy.controls.next}><SkipForward size={16} /></button></div><button className="round-button stop-button" type="button" onClick={app.stopPlayback} title={`${copy.controls.stopAndReset} (S)`} aria-label={copy.controls.stopAndReset} aria-keyshortcuts="S"><Square size={14} fill="currentColor" stroke="none" /><span>{copy.controls.stop}</span></button><div className="control-group volume-group"><button className="round-button" type="button" onClick={app.toggleMute} title={copy.controls.mute}>{state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><input className="volume" type="range" min="0" max="1" step="0.01" value={state.muted ? 0 : state.volume} onChange={(event) => { const volume = Number(event.currentTarget.value); const muted = volume === 0; if (app.videoRef.current) { app.videoRef.current.volume = volume; app.videoRef.current.muted = muted }; app.setState((current) => ({ ...current, volume, muted })); app.syncPlaybackMemory(volume, muted, state.playbackRate) }} aria-label={copy.controls.volume} /></div></div>
}

function PlaybackSecondaryControls(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  return <div className="control-group secondary-group"><div className="speed-control"><select className="speed-select" value={state.playbackRate} onChange={(event) => { const playbackRate = Number(event.currentTarget.value); if (app.videoRef.current) app.videoRef.current.playbackRate = playbackRate; app.setState((current) => ({ ...current, playbackRate })); app.syncPlaybackMemory(state.volume, state.muted, playbackRate) }} aria-label={copy.controls.playbackSpeed}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select><ChevronDown className="speed-control-icon" size={12} aria-hidden="true" /></div><button className="round-button" type="button" onClick={() => void app.toggleFullscreen()} title={app.isFullscreen ? copy.controls.exitFullscreen : copy.controls.fullscreen} aria-label={app.isFullscreen ? copy.controls.exitFullscreen : copy.controls.fullscreen} aria-pressed={app.isFullscreen} aria-keyshortcuts="F">{app.isFullscreen ? <Minimize2 size={16} /> : <Fullscreen size={16} />}</button></div>
}

export function PlaybackControls(): React.ReactElement | null {
  const app = useAppContext()
  if (!app.hasCurrentFile) return null
  const { state, copy } = app
  return <div className={`control-deck ${app.isControlDeckHidden ? 'is-hidden' : ''}`} aria-hidden={app.isControlDeckHidden}><div className="timeline-row"><span>{formatTime(state.currentTime)}</span><input className="timeline" type="range" min="0" max={state.duration || 0} value={state.currentTime} step="0.1" onChange={(event) => { const currentTime = Number(event.currentTarget.value); if (app.videoRef.current) app.videoRef.current.currentTime = currentTime; app.setState((current) => ({ ...current, currentTime })) }} aria-label={copy.controls.playbackPosition} /><span>{app.playbackTimeLabel}</span></div><div className="controls-row"><div className="controls-center-group"><PlaybackPrimaryControls /><PlaybackSecondaryControls /></div><div className="quick-subtitle-action"><QuickSubtitleButton /></div></div></div>
}
