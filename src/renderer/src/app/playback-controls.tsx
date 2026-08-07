import { Bookmark, BookmarkPlus, ChevronDown, Fullscreen, Minimize2, Pause, Play, Repeat, Repeat1, Scissors, Shuffle, SkipBack, SkipForward, Square, Volume2, VolumeX, X } from 'lucide-react'
import { useState } from 'react'
import { formatTime } from '../lib/time'
import { getPlaybackMediaKey, type PlaybackSegmentColor } from '../../../shared/playback-memory'
import type { MediaStructureSegment } from '../../../shared/media-types'
import { QuickSubtitleButton } from './quick-subtitle-button'
import { useAppContext } from './app-context'
import { findNearestPlaybackTrickplayFrame, usePlaybackTrickplay } from './use-playback-trickplay'
import { usePlaybackStructureAnalysis } from './use-playback-structure-analysis'

function PlaybackPrimaryControls({ activeStructureSegment }: { activeStructureSegment: MediaStructureSegment | null }): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  const structureLabel = activeStructureSegment ? copy.controls.structureSkipNames[activeStructureSegment.kind] : null
  const skipStructure = (): void => {
    if (!activeStructureSegment) return
    app.seekTo(Math.min(state.duration || activeStructureSegment.endSeconds, activeStructureSegment.endSeconds + 0.08))
  }
  return <div className="controls-primary"><div className="control-group transport-group"><button className="round-button" type="button" onClick={() => app.playAdjacent(-1)} title={copy.controls.previous}><SkipBack size={16} /></button><button className="round-button primary" type="button" onClick={app.togglePlay} title={`${state.isPlaying ? copy.controls.pause : copy.controls.play} (Space)`} aria-keyshortcuts="Space">{state.isPlaying ? <Pause size={18} /> : <Play size={18} />}</button><button className="round-button" type="button" onClick={() => app.playAdjacent(1)} title={copy.controls.next}><SkipForward size={16} /></button></div><button className="round-button stop-button" type="button" onClick={app.stopPlayback} title={`${copy.controls.stopAndReset} (S)`} aria-label={copy.controls.stopAndReset} aria-keyshortcuts="S"><Square size={14} fill="currentColor" stroke="none" /><span>{copy.controls.stop}</span></button>{activeStructureSegment && structureLabel ? <button className="round-button structure-skip-button" type="button" data-testid="playback-structure-skip" onClick={skipStructure} title={copy.controls.skipStructureAt(structureLabel, formatTime(activeStructureSegment.endSeconds))} aria-label={copy.controls.skipStructureAt(structureLabel, formatTime(activeStructureSegment.endSeconds))}><SkipForward size={14} /><span>{copy.controls.skipStructureAt(structureLabel, formatTime(activeStructureSegment.endSeconds))}</span></button> : null}<div className="control-group volume-group"><button className="round-button" type="button" onClick={app.toggleMute} title={copy.controls.mute}>{state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button><input className="volume" type="range" min="0" max="1" step="0.01" value={state.muted ? 0 : state.volume} onChange={(event) => { const volume = Number(event.currentTarget.value); const muted = volume === 0; if (app.videoRef.current) { app.videoRef.current.volume = volume; app.videoRef.current.muted = muted }; app.setState((current) => ({ ...current, volume, muted })); app.syncPlaybackMemory(volume, muted, state.playbackRate) }} aria-label={copy.controls.volume} /></div></div>
}

function PlaybackModeControls(): React.ReactElement {
  const app = useAppContext()
  const { copy } = app
  const repeatTitle = app.appSettings.playback.repeatMode === 'current' ? copy.controls.repeatCurrent : app.appSettings.playback.repeatMode === 'all' ? copy.controls.repeatAll : copy.controls.repeatNone
  const endActionTitle = app.appSettings.playback.endAction === 'next' ? copy.controls.endActionNext : copy.controls.endActionStop
  return <div className="control-group playback-mode-group"><button className={`round-button mode-button ${app.appSettings.playback.repeatMode !== 'none' ? 'active' : ''}`} type="button" onClick={app.cycleRepeatMode} title={`${copy.controls.repeat}: ${repeatTitle}`} aria-label={`${copy.controls.repeat}: ${repeatTitle}`} aria-pressed={app.appSettings.playback.repeatMode !== 'none'}>{app.appSettings.playback.repeatMode === 'current' ? <Repeat1 size={16} /> : <Repeat size={16} />}</button><button className={`round-button mode-button ${app.appSettings.playback.order === 'shuffle' ? 'active' : ''}`} type="button" onClick={app.togglePlaybackOrder} title={app.appSettings.playback.order === 'shuffle' ? copy.controls.shuffleOn : copy.controls.shuffleOff} aria-label={copy.controls.shuffle} aria-pressed={app.appSettings.playback.order === 'shuffle'}><Shuffle size={16} /></button><button className="round-button mode-button" type="button" onClick={app.togglePlaybackEndAction} title={endActionTitle} aria-label={endActionTitle} aria-pressed={app.appSettings.playback.endAction === 'next'}>{app.appSettings.playback.endAction === 'next' ? <SkipForward size={16} /> : <Square size={13} fill="currentColor" stroke="none" />}</button></div>
}

function PlaybackSegmentControl(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  const [draftStart, setDraftStart] = useState<number | null>(null)
  const [draftEnd, setDraftEnd] = useState<number | null>(null)
  const [name, setName] = useState('')
  const [color, setColor] = useState<PlaybackSegmentColor>('accent')
  const fileKey = state.currentFile ? getPlaybackMediaKey(state.currentFile) : null
  const segments = fileKey ? app.appSettings.playback.segmentsByFingerprint[fileKey] ?? [] : []
  const setStart = (): void => {
    setDraftStart(state.currentTime)
    if (draftEnd != null && draftEnd <= state.currentTime) setDraftEnd(null)
  }
  const setEnd = (): void => {
    if (draftStart == null || state.currentTime <= draftStart) return
    setDraftEnd(state.currentTime)
  }
  const save = (): void => {
    if (draftStart == null || draftEnd == null || draftEnd <= draftStart) return
    app.createPlaybackSegment(name || copy.controls.segmentDefaultName(formatTime(draftStart), formatTime(draftEnd)), draftStart, draftEnd, color)
    setDraftStart(null)
    setDraftEnd(null)
    setName('')
  }
  return <details className="segment-control">
    <summary className="round-button" title={copy.controls.segmentMenu} aria-label={copy.controls.segmentMenu}><Scissors size={15} /></summary>
    <div className="segment-popover">
      <div className="segment-popover-heading"><strong>{copy.controls.segmentMenu}</strong><span>{draftStart != null && draftEnd != null ? copy.controls.segmentRange(formatTime(draftStart), formatTime(draftEnd)) : '—'}</span></div>
      <div className="segment-popover-actions"><button className="segment-popover-button" type="button" onClick={setStart}>{copy.controls.setSegmentStart}</button><button className="segment-popover-button" type="button" onClick={setEnd} disabled={draftStart == null || state.currentTime <= draftStart}>{copy.controls.setSegmentEnd}</button><button className="segment-popover-button is-primary" type="button" onClick={save} disabled={draftStart == null || draftEnd == null || draftEnd <= draftStart}>{copy.controls.saveSegment}</button></div>
      <input className="segment-name-input" value={name} onChange={(event) => setName(event.currentTarget.value)} placeholder={copy.controls.segmentNamePlaceholder} aria-label={copy.controls.segmentNamePlaceholder} />
      <label className="segment-color-field"><span>{copy.controls.segmentColor}</span><select value={color} onChange={(event) => setColor(event.currentTarget.value as PlaybackSegmentColor)} aria-label={copy.controls.segmentColor}>{(['accent', 'cyan', 'violet', 'amber'] as const).map((option) => <option key={option} value={option}>{copy.controls.segmentColorNames[option]}</option>)}</select></label>
      {segments.length > 0 ? <div className="segment-list">{segments.map((segment) => <div className="segment-list-item" key={segment.id}><button type="button" onClick={() => app.seekTo(segment.startSeconds)} title={segment.name}><span className={`segment-list-swatch segment-color-${segment.color}`} /><span className="segment-list-copy"><strong>{segment.name}</strong><small>{copy.controls.segmentRange(formatTime(segment.startSeconds), formatTime(segment.endSeconds))}</small></span></button><button className="segment-list-remove" type="button" onClick={() => app.removePlaybackSegment(segment.id)} title={copy.controls.removeSegment} aria-label={`${copy.controls.removeSegment}: ${segment.name}`}><X size={12} /></button></div>)}</div> : null}
    </div>
  </details>
}

function PlaybackSecondaryControls(): React.ReactElement {
  const app = useAppContext()
  const { state, copy } = app
  return <div className="control-group secondary-group"><div className="speed-control"><select className="speed-select" value={state.playbackRate} onChange={(event) => { const playbackRate = Number(event.currentTarget.value); if (app.videoRef.current) app.videoRef.current.playbackRate = playbackRate; app.setState((current) => ({ ...current, playbackRate })); app.syncPlaybackMemory(state.volume, state.muted, playbackRate) }} aria-label={copy.controls.playbackSpeed}>{[0.5, 0.75, 1, 1.25, 1.5, 2].map((speed) => <option key={speed} value={speed}>{speed}x</option>)}</select><ChevronDown className="speed-control-icon" size={12} aria-hidden="true" /></div><PlaybackModeControls /><button className="round-button" type="button" onClick={() => app.createPlaybackBookmark(copy.controls.bookmarkAt(formatTime(state.currentTime)))} title={copy.controls.addBookmark} aria-label={copy.controls.addBookmark}><BookmarkPlus size={16} /></button><PlaybackSegmentControl /><button className="round-button" type="button" onClick={() => void app.toggleFullscreen()} title={app.isFullscreen ? copy.controls.exitFullscreen : copy.controls.fullscreen} aria-label={app.isFullscreen ? copy.controls.exitFullscreen : copy.controls.fullscreen} aria-pressed={app.isFullscreen} aria-keyshortcuts="F">{app.isFullscreen ? <Minimize2 size={16} /> : <Fullscreen size={16} />}</button></div>
}

export function PlaybackControls(): React.ReactElement | null {
  const app = useAppContext()
  const trickplay = usePlaybackTrickplay(app.state.currentFile?.path ?? null, app.state.duration || app.mediaMetadata?.durationSeconds || 0)
  const [hoverTime, setHoverTime] = useState<number | null>(null)
  const duration = app.state.duration || app.mediaMetadata?.durationSeconds || 0
  const fileKey = app.state.currentFile ? getPlaybackMediaKey(app.state.currentFile) : null
  const structureCorrections = fileKey ? app.appSettings.playback.structureCorrectionsByFingerprint[fileKey] ?? [] : []
  const structure = usePlaybackStructureAnalysis(app.state.currentFile?.path ?? null, duration, app.state.currentTime, structureCorrections)
  if (!app.hasCurrentFile) return null
  const { state, copy } = app
  const bookmarks = fileKey ? app.appSettings.playback.bookmarksByFingerprint[fileKey] ?? [] : []
  const segments = fileKey ? app.appSettings.playback.segmentsByFingerprint[fileKey] ?? [] : []
  const chapters = app.mediaMetadata?.chapters ?? []
  const hoverFrame = hoverTime == null ? null : findNearestPlaybackTrickplayFrame(trickplay.frames, hoverTime)
  const hoverPercent = hoverTime == null || duration <= 0 ? null : Math.max(6, Math.min(94, hoverTime / duration * 100))
  const markerPercent = (timeSeconds: number): number => duration > 0 ? Math.min(100, Math.max(0, timeSeconds / duration * 100)) : 0
  return <div className={`control-deck ${app.isControlDeckHidden ? 'is-hidden' : ''}`} aria-hidden={app.isControlDeckHidden}><div className="timeline-row"><span>{formatTime(state.currentTime)}</span><div className="timeline-shell"><div className="timeline-markers">{segments.map((segment) => <button className={`timeline-segment-marker segment-color-${segment.color}`} key={segment.id} type="button" style={{ left: `${markerPercent(segment.startSeconds)}%`, width: `${Math.max(0.5, markerPercent(segment.endSeconds) - markerPercent(segment.startSeconds))}%` }} title={`${segment.name} · ${copy.controls.segmentRange(formatTime(segment.startSeconds), formatTime(segment.endSeconds))}`} aria-label={`${segment.name} · ${copy.controls.segmentRange(formatTime(segment.startSeconds), formatTime(segment.endSeconds))}`} onClick={() => app.seekTo(segment.startSeconds)} onContextMenu={(event) => { event.preventDefault(); app.removePlaybackSegment(segment.id) }}><span /></button>)}{chapters.map((chapter) => <button className="timeline-marker chapter-marker" key={`chapter-${chapter.id}-${chapter.startSeconds}`} type="button" style={{ left: `${markerPercent(chapter.startSeconds)}%` }} title={copy.controls.chapterAt(chapter.title, formatTime(chapter.startSeconds))} aria-label={copy.controls.chapterAt(chapter.title, formatTime(chapter.startSeconds))} onClick={() => app.seekTo(chapter.startSeconds)}><span /></button>)}{bookmarks.map((bookmark) => <button className="timeline-marker bookmark-marker" key={bookmark.id} type="button" style={{ left: `${markerPercent(bookmark.timeSeconds)}%` }} title={`${bookmark.name} · ${formatTime(bookmark.timeSeconds)} · ${copy.controls.removeBookmark}`} aria-label={`${bookmark.name} · ${formatTime(bookmark.timeSeconds)}`} onClick={() => app.seekTo(bookmark.timeSeconds)} onContextMenu={(event) => { event.preventDefault(); app.removePlaybackBookmark(bookmark.id) }}><Bookmark size={10} /></button>)}</div>{hoverPercent != null ? <div className="timeline-trickplay-preview" style={{ left: `${hoverPercent}%` }} role="status" aria-label={copy.controls.trickplayPreview(formatTime(hoverTime ?? 0))}>{hoverFrame ? <img src={hoverFrame.url} alt="" /> : <span>{trickplay.loading ? copy.controls.trickplayLoading : copy.controls.trickplayUnavailable}</span>}<strong>{formatTime(hoverTime ?? 0)}</strong></div> : null}<input className="timeline" type="range" min="0" max={duration} value={state.currentTime} step="0.1" onPointerMove={(event) => { const bounds = event.currentTarget.getBoundingClientRect(); const ratio = bounds.width > 0 ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : 0; setHoverTime(ratio * duration) }} onPointerLeave={() => setHoverTime(null)} onFocus={() => setHoverTime(state.currentTime)} onBlur={() => setHoverTime(null)} onChange={(event) => { const currentTime = Number(event.currentTarget.value); if (app.videoRef.current) app.videoRef.current.currentTime = currentTime; app.setState((current) => ({ ...current, currentTime })) }} aria-label={copy.controls.playbackPosition} /></div><span>{app.playbackTimeLabel}</span></div><div className="controls-row"><div className="controls-center-group"><PlaybackPrimaryControls activeStructureSegment={structure.activeSegment} /><PlaybackSecondaryControls /></div><div className="quick-subtitle-action"><QuickSubtitleButton /></div></div></div>
}
