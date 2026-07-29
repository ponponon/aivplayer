import { ChevronLeft, ChevronRight, Download, FilePlus2, FolderOpen, Grid3X3, Pause, Play, Plus, Redo2, RotateCcw, Save, Scissors, Trash2, Undo2, X, ZoomIn, ZoomOut } from 'lucide-react'
import { useRef, useState } from 'react'
import type { ClipExportMode } from '../../../shared/clip-export'
import { editedDurationSeconds, editedTimeToSource, getVideoClipSpans } from '../../../core/editing/timeline-math'
import { getEditingFilmstripTiles } from '../../../core/editing/filmstrip-operations'
import { formatTime } from '../lib/time'
import { useAppContext } from './app-context'
import { EditingCaptionTrack } from './editing-caption-track'
import { EditingAudioControl } from './editing-audio-control'
import { EditingClipBoundaryHandles } from './editing-clip-boundary-handles'
import { EditingExportSummary } from './editing-export-summary'
import { EditingExportConfirmDialog } from './editing-export-confirm-dialog'
import { EditingRangeTrack } from './editing-range-track'
import { EditingScriptPanel } from './editing-script-panel'
import { EditingTreatmentControl } from './editing-treatment-control'
import { EditingFilterControl } from './editing-filter-control'
import { EditingTransitionControl } from './editing-transition-control'
import { EditingGraphicControl } from './editing-graphic-control'
import { EditingGraphicEditor } from './editing-graphic-editor'
import { EditingGraphicTrack } from './editing-graphic-track'
import { EditingVideoBlockControl } from './editing-video-block-control'; import { EditingVideoBlockTrack } from './editing-video-block-track'; import { EditingVideoBlockEditor } from './editing-video-block-editor'
import { useEditingFilmstrips } from './use-editing-filmstrip'
const MAX_RULER_TICKS = 121
function formatClipLabel(startSeconds: number, endSeconds: number): string {
  return `${formatTime(startSeconds)} – ${formatTime(endSeconds)}`
}
type ClipDragState = { from: number; to: number; dx: number; moved: boolean; startX: number; startCenter: number; mids: number[] }
export function EditingTimeline(): React.ReactElement | null {
  const app = useAppContext()
  const project = app.editingProject
  const filmstrips = useEditingFilmstrips(project, app.editingSourceFiles)
  const [zoom, setZoom] = useState(1)
  const [isExportConfirmOpen, setIsExportConfirmOpen] = useState(false)
  const [selectedScriptSegmentId, setSelectedScriptSegmentId] = useState<string | null>(null)
  const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
  const clipDragRef = useRef<ClipDragState | null>(null)
  const suppressClipClickRef = useRef(false)
  if (!project) return null
  const spans = getVideoClipSpans(project.videoClips)
  const durationSeconds = editedDurationSeconds(project.videoClips)
  const selectedClip = project.videoClips.find((clip) => clip.id === app.editingSelectedClipId) ?? null
  const selectedGraphic = project.graphics?.find((graphic) => graphic.id === app.editingSelectedGraphicId) ?? null
  const selectedVideoBlock = project.videoBlocks?.find((block) => block.id === app.editingSelectedVideoBlockId) ?? null; const selectedVideoBlockSource = selectedVideoBlock ? project.sources.find((source) => source.id === selectedVideoBlock.sourceId) ?? null : null
  const selectedClipIndex = selectedClip ? project.videoClips.findIndex((clip) => clip.id === selectedClip.id) : -1
  const currentTime = Math.min(Math.max(0, app.editingCurrentTime), durationSeconds)
  const currentPoint = editedTimeToSource(project.videoClips, currentTime)
  const canSplit = Boolean(currentPoint && currentPoint.sourceSeconds > currentPoint.clip.sourceStartSeconds + 0.01 && currentPoint.sourceSeconds < currentPoint.clip.sourceEndSeconds - 0.01)
  const canExport = spans.length > 0
  const hasExportSubtitle = project.captions.some((caption) => caption.text.trim().length > 0) || app.hasClipExportSubtitle
  const rulerTickCount = Math.min(MAX_RULER_TICKS, Math.max(2, Math.ceil(durationSeconds) + 1))
  const playheadPercent = durationSeconds > 0 ? (currentTime / durationSeconds) * 100 : 0
  const snapPoints = [...new Set([currentTime, ...spans.flatMap((span) => [span.editedStartSeconds, span.editedEndSeconds])])]
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
  const confirmEditingExport = (mode: ClipExportMode, outputVideoPath: string): void => {
    setIsExportConfirmOpen(false)
    app.syncClipExportPreferences(app.appSettings.capture.clipExportLengthSeconds, mode)
    void app.exportEditingTimeline(mode, outputVideoPath)
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
        <EditingTreatmentControl clip={selectedClip} title={app.copy.editing.treatmentLabel} fullLabel={app.copy.editing.fullFrame} punchInLabel={app.copy.editing.punchIn} scaleLabel={app.copy.editing.punchInScale} focusLabel={app.copy.editing.punchInFocus} focusLeft={app.copy.editing.focusLeft} focusCenter={app.copy.editing.focusCenter} focusRight={app.copy.editing.focusRight} onChange={(treatment, scale, anchor) => selectedClip && app.setEditingClipTreatment(selectedClip.id, treatment, scale, anchor)} />
        <EditingFilterControl clip={selectedClip} title={app.copy.editing.filterTitle} brightnessLabel={app.copy.editing.brightness} contrastLabel={app.copy.editing.contrast} saturationLabel={app.copy.editing.saturation} resetLabel={app.copy.editing.filterReset} onChange={(filter) => selectedClip && app.setEditingClipFilter(selectedClip.id, filter)} />
        <EditingTransitionControl clip={selectedClip} isFirstClip={selectedClipIndex <= 0} title={app.copy.editing.transitionTitle} noneLabel={app.copy.editing.transitionNone} transitionLabels={app.copy.editing.transitionLabels} durationLabel={app.copy.editing.transitionDuration} onChange={(transition) => selectedClip && app.setEditingClipTransition(selectedClip.id, transition)} />
        <EditingGraphicControl title={app.copy.editing.graphicTitle} textLabel={app.copy.editing.graphicText} textPlaceholder={app.copy.editing.graphicPlaceholder} addLabel={app.copy.editing.graphicAdd} positionLabel={app.copy.editing.graphicPosition} styleLabel={app.copy.editing.graphicStyle} titleStyleLabel={app.copy.editing.graphicStyleTitle} labelStyleLabel={app.copy.editing.graphicStyleLabel} durationLabel={app.copy.editing.graphicDuration} positionLabels={app.copy.editing.graphicPositionLabels} currentTime={currentTime} timelineDuration={durationSeconds} onAdd={app.addEditingGraphic} />
        <EditingGraphicEditor graphic={selectedGraphic} title={app.copy.editing.graphicEditTitle} textLabel={app.copy.editing.graphicText} textPlaceholder={app.copy.editing.graphicPlaceholder} saveLabel={app.copy.editing.graphicSave} positionLabel={app.copy.editing.graphicPosition} styleLabel={app.copy.editing.graphicStyle} titleStyleLabel={app.copy.editing.graphicStyleTitle} labelStyleLabel={app.copy.editing.graphicStyleLabel} durationLabel={app.copy.editing.graphicDuration} positionLabels={app.copy.editing.graphicPositionLabels} timelineDuration={durationSeconds} onUpdate={app.updateEditingGraphic} />
        <EditingVideoBlockControl sources={project.sources} title={app.copy.editing.videoBlockTitle} addLabel={app.copy.editing.videoBlockAdd} sourceLabel={app.copy.editing.videoBlockSource} positionLabel={app.copy.editing.videoBlockPosition} positionLabels={app.copy.editing.videoBlockPositionLabels} onAdd={app.addEditingVideoBlock} />
        <EditingVideoBlockEditor block={selectedVideoBlock} source={selectedVideoBlockSource} title={app.copy.editing.videoBlockEditTitle} positionLabel={app.copy.editing.videoBlockPosition} positionLabels={app.copy.editing.videoBlockPositionLabels} sourceStartLabel={app.copy.editing.videoBlockSourceStart} durationLabel={app.copy.editing.graphicDuration} sizeLabel={app.copy.editing.videoBlockSize} radiusLabel={app.copy.editing.videoBlockRadius} borderLabel={app.copy.editing.videoBlockBorder} enterLabel={app.copy.editing.videoBlockEnter} exitLabel={app.copy.editing.videoBlockExit} motionDurationLabel={app.copy.editing.videoBlockMotionDuration} motionLabels={app.copy.editing.videoBlockMotionLabels} onUpdate={app.updateEditingVideoBlock} />
        <EditingExportSummary clips={project.videoClips} durationSeconds={durationSeconds} canvasWidth={project.sources[0]?.width} canvasHeight={project.sources[0]?.height} summaryLabel={app.copy.editing.export} durationLabel={app.copy.panels.duration} clipsLabel={app.copy.editing.videoTrack} resolutionLabel={app.copy.panels.resolution} audioLabel={app.copy.panels.audioStream} muteLabel={app.copy.controls.mute} volumeLabel={app.copy.controls.volume} />
        <button className="editing-export-button" type="button" onClick={() => setIsExportConfirmOpen(true)} disabled={!canExport || app.isExportingClip} title={app.isExportingClip ? app.copy.editing.exporting : app.copy.editing.export} aria-label={app.copy.editing.export} data-testid="editing-export"><Download size={15} />{app.isExportingClip ? app.copy.editing.exporting : app.copy.editing.export}</button>
      </div>
      <EditingScriptPanel segments={project.scriptSegments ?? []} selectedSegmentId={selectedScriptSegmentId} title={app.copy.editing.scriptTitle} hint={app.copy.editing.scriptHint} emptyLabel={app.copy.editing.scriptEmpty} deleteLabel={app.copy.editing.scriptDelete} restoreLabel={app.copy.editing.scriptRestore} deletedLabel={app.copy.editing.scriptDeleted} countLabel={app.copy.editing.scriptCount} onSelect={(segmentId) => { setSelectedScriptSegmentId(segmentId); app.selectEditingScriptSegment(segmentId) }} onDelete={(segmentId) => { setSelectedScriptSegmentId(segmentId); app.deleteEditingScriptSegment(segmentId) }} onRestore={(segmentId) => { setSelectedScriptSegmentId(segmentId); app.restoreEditingScriptSegment(segmentId) }} />
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
            <EditingRangeTrack durationSeconds={durationSeconds} currentTime={currentTime} snapPoints={snapPoints} trackLabel={app.copy.editing.playhead} deleteRangeLabel={app.copy.editing.deleteRange} onSeek={app.seekEditingTime} onDeleteRange={app.deleteEditingRange}>
              {spans.map((span) => <EditingClipBoundaryHandles key={`boundary-${span.clip.id}`} span={span} durationSeconds={durationSeconds} snapPoints={snapPoints} startLabel={app.copy.editing.trimLeft} endLabel={app.copy.editing.trimRight} onCommit={app.updateEditingClipBoundary} />)}
              <div className="editing-clip-row">
                {spans.map((span, index) => {
                  const selected = app.editingSelectedClipId === span.clip.id
                  const dragged = clipDrag?.from === index
                  const sourceDurationSeconds = project.sources.find((source) => source.id === span.clip.sourceId)?.durationSeconds ?? span.clip.sourceEndSeconds
                  const clipTiles = getEditingFilmstripTiles(filmstrips[span.clip.sourceId] ?? [], span.clip.sourceStartSeconds, span.clip.sourceEndSeconds, sourceDurationSeconds)
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
                  >{clipTiles.length > 0 ? <span className="editing-clip-filmstrip" aria-hidden="true">{clipTiles.map((tile) => <img key={`${tile.frame.sourceSeconds}-${tile.frame.url.slice(-12)}`} src={tile.frame.url} alt="" style={{ left: `${tile.leftPercent}%`, width: `${tile.widthPercent}%` }} />)}</span> : null}<span>{index + 1}</span><small>{formatClipLabel(span.clip.sourceStartSeconds, span.clip.sourceEndSeconds)}</small></button>
                })}
                {clipDrag?.moved && clipDrag.to !== clipDrag.from ? <span className="editing-clip-drop-marker" style={{ left: `${durationSeconds > 0 ? (((clipDrag.to < clipDrag.from ? spans[clipDrag.to]!.editedStartSeconds : spans[clipDrag.to]!.editedEndSeconds) / durationSeconds) * 100) : 0}%` }} aria-hidden="true" /> : null}
              </div>
              <div className="editing-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><span /></div>
            </EditingRangeTrack>
          </div>
          <div className="editing-track-row editing-caption-row">
            <span className="editing-track-label">{app.copy.editing.captionTrack}</span>
            <EditingCaptionTrack captions={project.captions} durationSeconds={durationSeconds} selectedCaptionId={app.editingSelectedCaptionId} emptyLabel={app.copy.editing.captionEmpty} onSelectCaption={app.selectEditingCaption} onMoveCaption={app.moveEditingCaption} />
          </div>
          <EditingGraphicTrack graphics={project.graphics ?? []} durationSeconds={durationSeconds} selectedGraphicId={app.editingSelectedGraphicId} trackLabel={app.copy.editing.graphicTrack} emptyLabel={app.copy.editing.graphicEmpty} deleteLabel={app.copy.editing.graphicDelete} onSelect={app.selectEditingGraphic} onDelete={app.deleteEditingGraphic} onMove={(graphicId, startSeconds) => app.updateEditingGraphic(graphicId, { startSeconds })} />
          <EditingVideoBlockTrack blocks={project.videoBlocks ?? []} durationSeconds={durationSeconds} selectedBlockId={selectedVideoBlock?.id ?? null} trackLabel={app.copy.editing.videoBlockTrack} emptyLabel={app.copy.editing.videoBlockEmpty} deleteLabel={app.copy.editing.videoBlockDelete} onSelect={app.selectEditingVideoBlock} onDelete={app.deleteEditingVideoBlock} onMove={(blockId, startSeconds) => app.updateEditingVideoBlock(blockId, { startSeconds })} />
        </div>
      </div>
      {isExportConfirmOpen ? <EditingExportConfirmDialog copy={app.copy} mediaPath={project.sources[0]?.path ?? ''} clips={project.videoClips} durationSeconds={durationSeconds} canvasWidth={project.sources[0]?.width} canvasHeight={project.sources[0]?.height} hasSubtitle={hasExportSubtitle} initialMode={hasExportSubtitle ? app.appSettings.capture.clipExportMode : 'video'} onClose={() => setIsExportConfirmOpen(false)} onConfirm={confirmEditingExport} /> : null}
    </section>
  )
}
