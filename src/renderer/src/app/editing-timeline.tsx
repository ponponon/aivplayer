import { ChevronLeft, ChevronRight, Download, FilePlus2, FolderOpen, Grid3X3, Pause, Play, Plus, Redo2, RotateCcw, Save, Scissors, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useRef, useState } from 'react'
import { editedDurationSeconds, editedTimeToSource, getVideoClipSpans } from '../../../core/editing/timeline-math'
import { formatTime } from '../lib/time'
import { useAppContext } from './app-context'
import { EditingCaptionTrack } from './editing-caption-track'
import { EditingAudioControl } from './editing-audio-control'
import { useEditingFilmstrip, type EditingFilmstripFrame } from './use-editing-filmstrip'

const MAX_RULER_TICKS = 121

function formatClipLabel(startSeconds: number, endSeconds: number): string {
  return `${formatTime(startSeconds)} – ${formatTime(endSeconds)}`
}

function framesForClip(frames: readonly EditingFilmstripFrame[], startSeconds: number, endSeconds: number): EditingFilmstripFrame[] {
  const matched = frames.filter((frame) => frame.sourceSeconds >= startSeconds && frame.sourceSeconds <= endSeconds)
  if (matched.length > 0) return matched
  const nearest = frames.reduce<EditingFilmstripFrame | null>((best, frame) => !best || Math.abs(frame.sourceSeconds - startSeconds) < Math.abs(best.sourceSeconds - startSeconds) ? frame : best, null)
  return nearest ? [nearest] : []
}

type ClipDragState = { from: number; to: number; dx: number; moved: boolean; startX: number; startCenter: number; mids: number[] }

export function EditingTimeline(): React.ReactElement | null {
  const app = useAppContext()
  const project = app.editingProject
  const filmstrip = useEditingFilmstrip(project, app.state.currentFile?.url ?? null)
  const [zoom, setZoom] = useState(1)
  const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
  const clipDragRef = useRef<ClipDragState | null>(null)
  const suppressClipClickRef = useRef(false)
  if (!project) return null

  const spans = getVideoClipSpans(project.videoClips)
  const durationSeconds = editedDurationSeconds(project.videoClips)
  const selectedClip = project.videoClips.find((clip) => clip.id === app.editingSelectedClipId) ?? null
  const currentTime = Math.min(Math.max(0, app.editingCurrentTime), durationSeconds)
  const currentPoint = editedTimeToSource(project.videoClips, currentTime)
  const canSplit = Boolean(currentPoint && currentPoint.sourceSeconds > currentPoint.clip.sourceStartSeconds + 0.01 && currentPoint.sourceSeconds < currentPoint.clip.sourceEndSeconds - 0.01)
  const canExport = spans.length > 0
  const rulerTickCount = Math.min(MAX_RULER_TICKS, Math.max(2, Math.ceil(durationSeconds) + 1))
  const playheadPercent = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0

  const seekFromPointer = (clientX: number, element: HTMLElement): void => {
    const bounds = element.getBoundingClientRect()
    const ratio = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0
    app.seekEditingTime(ratio * durationSeconds)
  }

  const onTrackKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      app.seekEditingTime(currentTime + (event.key === 'ArrowLeft' ? -0.1 : 0.1))
    }
  }

  const startClipDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number): void => {
    if (event.button !== 0 || spans.length <= 1 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-track"]')
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const startCenter = ((spans[index]!.editedStartSeconds + spans[index]!.editedEndSeconds) / 2 / durationSeconds) * bounds.width
    const mids = spans.map((span) => ((span.editedStartSeconds + span.editedEndSeconds) / 2 / durationSeconds) * bounds.width)
    const next = { from: index, to: index, dx: 0, moved: false, startX: event.clientX - bounds.left, startCenter, mids }
    clipDragRef.current = next
    setClipDrag(next)
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveClipDrag = (event: React.PointerEvent<HTMLButtonElement>, index: number): void => {
    const drag = clipDragRef.current
    if (!drag || drag.from !== index) return
    const track = event.currentTarget.closest('[data-testid="editing-track"]')
    if (!(track instanceof HTMLElement)) return
    const dx = event.clientX - track.getBoundingClientRect().left - drag.startX
    const moved = drag.moved || Math.abs(dx) > 4
    if (!moved) return
    let to = 0
    for (let cursor = 0; cursor < drag.mids.length; cursor += 1) if (cursor !== drag.from && drag.startCenter + dx > drag.mids[cursor]!) to += 1
    const next = { ...drag, dx, to, moved: true }
    clipDragRef.current = next
    setClipDrag(next)
    event.preventDefault()
  }

  const finishClipDrag = (): void => {
    const drag = clipDragRef.current
    clipDragRef.current = null
    setClipDrag(null)
    if (!drag?.moved || drag.to === drag.from) return
    suppressClipClickRef.current = true
    app.reorderEditingClips(drag.from, drag.to)
    window.setTimeout(() => { suppressClipClickRef.current = false }, 0)
  }

  return (
    <section className="editing-timeline" data-testid="editing-timeline" aria-label={app.copy.editing.timelineLabel}>
      <div className="editing-toolbar">
        <div className="editing-toolbar-heading">
          <span className="editing-toolbar-kicker">{app.copy.editing.kicker}</span>
          <strong>{project.title}</strong>
          {app.editingProjectStatus ? <span className={`editing-project-status ${app.editingProjectStatus.success ? 'is-success' : 'is-error'}`} role="status">{app.editingProjectStatus.message}</span> : null}
        </div>
        <div className="editing-toolbar-actions">
          <button className="editing-icon-button" type="button" onClick={() => void app.addEditingSources()} disabled={app.isAddingEditingMedia} title={app.isAddingEditingMedia ? app.copy.editing.addingMedia : app.copy.editing.addMedia} aria-label={app.copy.editing.addMedia} data-testid="editing-add-media"><Plus size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.newEditingProject} title={app.copy.editing.newProject} aria-label={app.copy.editing.newProject} data-testid="editing-new-project"><FilePlus2 size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.resetEditingProject} title={app.copy.editing.resetProject} aria-label={app.copy.editing.resetProject} data-testid="editing-reset-project"><RotateCcw size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={() => void app.openEditingProjectFile()} title={app.copy.editing.openProject} aria-label={app.copy.editing.openProject} data-testid="editing-open-project"><FolderOpen size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={() => void app.saveEditingProjectFile()} title={app.copy.editing.saveProject} aria-label={app.copy.editing.saveProject} data-testid="editing-save-project"><Save size={15} /></button>
          <span className="editing-toolbar-divider" aria-hidden="true" />
          <button className="editing-icon-button" type="button" onClick={app.undoEditing} disabled={app.editingPast.length === 0} title={app.copy.editing.undo} aria-label={app.copy.editing.undo} data-testid="editing-undo"><Undo2 size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.redoEditing} disabled={app.editingFuture.length === 0} title={app.copy.editing.redo} aria-label={app.copy.editing.redo} data-testid="editing-redo"><Redo2 size={15} /></button>
          <span className="editing-toolbar-divider" aria-hidden="true" />
          <button className="editing-icon-button" type="button" onClick={() => setZoom((value) => Math.max(0.75, value - 0.25))} disabled={zoom <= 0.75} title={app.copy.editing.zoomOut} aria-label={app.copy.editing.zoomOut}><ZoomOut size={15} /></button>
          <span className="editing-zoom-label">{Math.round(zoom * 100)}%</span>
          <button className="editing-icon-button" type="button" onClick={() => setZoom((value) => Math.min(3, value + 0.25))} disabled={zoom >= 3} title={app.copy.editing.zoomIn} aria-label={app.copy.editing.zoomIn}><ZoomIn size={15} /></button>
          <button className="editing-icon-button" type="button" onClick={app.closeEditingMode} title={app.copy.editing.close} aria-label={app.copy.editing.close} data-testid="editing-close"><X size={15} /></button>
        </div>
      </div>

      <div className="editing-action-row">
        <div className="editing-transport">
          <button className="editing-primary-button" type="button" onClick={() => void app.toggleEditingPlay()} title={app.state.isPlaying ? app.copy.controls.pause : app.copy.controls.play} aria-label={app.state.isPlaying ? app.copy.controls.pause : app.copy.controls.play} data-testid="editing-play">{app.state.isPlaying ? <Pause size={16} /> : <Play size={16} />}</button>
          <span className="editing-time-readout">{formatTime(currentTime)} <span>/ {formatTime(durationSeconds)}</span></span>
        </div>
        <div className="editing-edit-actions" role="toolbar" aria-label={app.copy.editing.editTools}>
          <button className="editing-tool-button" type="button" onClick={app.trimEditingClipLeft} disabled={!canSplit} title={app.copy.editing.trimLeft} aria-label={app.copy.editing.trimLeft}><ChevronLeft size={15} /><span>{app.copy.editing.trimLeftShort}</span></button>
          <button className="editing-tool-button" type="button" onClick={app.trimEditingClipRight} disabled={!canSplit} title={app.copy.editing.trimRight} aria-label={app.copy.editing.trimRight}><ChevronRight size={15} /><span>{app.copy.editing.trimRightShort}</span></button>
          <button className="editing-tool-button editing-tool-button-accent" type="button" onClick={app.splitEditingClip} disabled={!canSplit} title={app.copy.editing.split} aria-label={app.copy.editing.split} data-testid="editing-split"><Scissors size={15} /><span>{app.copy.editing.splitShort}</span></button>
          <button className="editing-tool-button editing-tool-button-danger" type="button" onClick={app.deleteEditingClip} disabled={spans.length <= 1} title={app.copy.editing.deleteClip} aria-label={app.copy.editing.deleteClip}><Trash2 size={15} /><span>{app.copy.editing.deleteShort}</span></button>
        </div>
        <EditingAudioControl clip={selectedClip} volumeLabel={app.copy.controls.volume} muteLabel={app.copy.controls.mute} onVolumeChange={(volume) => selectedClip && app.setEditingClipVolume(selectedClip.id, volume)} onToggleMute={() => selectedClip && app.toggleEditingClipMute(selectedClip.id)} />
        <button className="editing-export-button" type="button" onClick={() => void app.exportEditingTimeline()} disabled={!canExport || app.isExportingClip} title={app.isExportingClip ? app.copy.editing.exporting : app.copy.editing.export} aria-label={app.copy.editing.export}><Download size={15} />{app.isExportingClip ? app.copy.editing.exporting : app.copy.editing.export}</button>
      </div>

      <div className="editing-timeline-scroll">
        <div className="editing-timeline-content" style={{ width: `${Math.max(100, zoom * 100)}%` }}>
          <div className="editing-ruler-row">
            <span className="editing-track-label" aria-hidden="true"><Grid3X3 size={13} /></span>
            <div className="editing-ruler" aria-hidden="true">
              {Array.from({ length: rulerTickCount }, (_, index) => <span key={index} className="editing-ruler-tick" style={{ left: `${durationSeconds > 0 ? (index / (rulerTickCount - 1)) * 100 : 0}%` }}>{formatTime(index)}</span>)}
            </div>
          </div>
          <div className="editing-track-row">
            <span className="editing-track-label">{app.copy.editing.videoTrack}</span>
            <div
              className="editing-track"
              role="group"
              tabIndex={0}
              aria-label={app.copy.editing.playhead}
              onClick={(event) => seekFromPointer(event.clientX, event.currentTarget)}
              onKeyDown={onTrackKeyDown}
              data-testid="editing-track"
            >
              <div className="editing-clip-row">
                {spans.map((span, index) => {
                  const selected = app.editingSelectedClipId === span.clip.id
                  const dragged = clipDrag?.from === index
                  const clipFrames = framesForClip(filmstrip, span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)
                  return <button
                    className={`editing-clip ${currentPoint?.index === span.index ? 'is-active' : ''} ${selected ? 'is-selected' : ''} ${dragged && clipDrag?.moved ? 'is-dragging' : ''}`}
                    key={span.clip.id}
                    type="button"
                    style={{ width: `${durationSeconds > 0 ? ((span.editedEndSeconds - span.editedStartSeconds) / durationSeconds) * 100 : 0}%`, ...(dragged && clipDrag?.moved ? { transform: `translateX(${clipDrag.dx}px)`, zIndex: 4 } : {}) }}
                    title={formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}
                    aria-label={`${index + 1}: ${formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}`}
                    onPointerDown={(event) => startClipDrag(event, index)}
                    onPointerMove={(event) => moveClipDrag(event, index)}
                    onPointerUp={finishClipDrag}
                    onPointerCancel={finishClipDrag}
                    onClick={(event) => { event.stopPropagation(); if (suppressClipClickRef.current) return; app.selectEditingClip(span.clip.id) }}
                    onKeyDown={(event) => {
                      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
                      event.preventDefault()
                      event.stopPropagation()
                      app.reorderEditingClips(index, index + (event.key === 'ArrowLeft' ? -1 : 1))
                    }}
                  >{clipFrames.length > 0 ? <span className="editing-clip-filmstrip" aria-hidden="true">{clipFrames.map((frame) => <img key={`${frame.sourceSeconds}-${frame.url.slice(-12)}`} src={frame.url} alt="" />)}</span> : null}<span>{index + 1}</span><small>{formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}</small></button>
                })}
                {clipDrag?.moved && clipDrag.to !== clipDrag.from ? <span className="editing-clip-drop-marker" style={{ left: `${durationSeconds > 0 ? (((clipDrag.to < clipDrag.from ? spans[clipDrag.to]!.editedStartSeconds : spans[clipDrag.to]!.editedEndSeconds) / durationSeconds) * 100) : 0}%` }} aria-hidden="true" /> : null}
              </div>
              <div className="editing-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><span /></div>
            </div>
          </div>
          <div className="editing-track-row editing-caption-row">
            <span className="editing-track-label">{app.copy.editing.captionTrack}</span>
            <EditingCaptionTrack captions={project.captions} durationSeconds={durationSeconds} selectedCaptionId={app.editingSelectedCaptionId} emptyLabel={app.copy.editing.captionEmpty} onSelectCaption={app.selectEditingCaption} onMoveCaption={app.moveEditingCaption} />
          </div>
        </div>
      </div>
    </section>
  )
}
