import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { snapEditedTime } from '../../../core/editing/timeline-snapping'
import type { EditingGraphic, EditingOverlayTrackKind } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'
import { EDITING_OVERLAY_TRACK_DRAG_TYPE, readEditingOverlayTrackDrag, writeEditingOverlayTrackDrag } from './editing-overlay-track-dnd'
import { editingTimeFromTimelinePointer, type EditingTrackTrimEdge, type EditingTrackTrimState, updateEditingTrackTrim } from './editing-track-trim'

type EditingGraphicTrackProps = {
  graphics: readonly EditingGraphic[]
  durationSeconds: number
  selectedGraphicId: string | null
  selectedGraphicIds?: ReadonlySet<string>
  trackLabel: string
  trackKind: EditingOverlayTrackKind
  onReorderTrack: (source: EditingOverlayTrackKind, target: EditingOverlayTrackKind) => void
  emptyLabel: string
  deleteLabel: string
  snapPoints?: readonly number[]
  onSelect: (graphicId: string, additive?: boolean) => void
  onDelete: (graphicId: string) => void
  onMove: (graphicId: string, startSeconds: number) => void
  onResize: (graphicId: string, startSeconds: number, endSeconds: number) => void
}

type GraphicDragState = { id: string; startSeconds: number; pointerOffsetSeconds: number; moved: boolean }

export function EditingGraphicTrack({ graphics, durationSeconds, selectedGraphicId, selectedGraphicIds, trackLabel, trackKind, onReorderTrack, emptyLabel, deleteLabel, snapPoints = [], onSelect, onDelete, onMove, onResize }: EditingGraphicTrackProps): React.ReactElement {
  const [drag, setDrag] = useState<GraphicDragState | null>(null)
  const dragRef = useRef<GraphicDragState | null>(null)
  const [trim, setTrim] = useState<EditingTrackTrimState | null>(null)
  const trimRef = useRef<EditingTrackTrimState | null>(null)
  const suppressClickRef = useRef(false)
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, graphic: EditingGraphic): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-graphic-track"]')
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const startPixels = (graphic.startSeconds / durationSeconds) * bounds.width
    const pointerOffsetSeconds = ((event.clientX - bounds.left) - startPixels) / Math.max(1, bounds.width) * durationSeconds
    const next = { id: graphic.id, startSeconds: graphic.startSeconds, pointerOffsetSeconds, moved: false }
    dragRef.current = next
    setDrag(next)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const active = dragRef.current
    if (!active) return
    const track = event.currentTarget.closest('[data-testid="editing-graphic-track"]')
    const graphic = graphics.find((candidate) => candidate.id === active.id)
    if (!(track instanceof HTMLElement) || !graphic) return
    const bounds = track.getBoundingClientRect()
    const pointerSeconds = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * durationSeconds
    const maxStartSeconds = Math.max(0, durationSeconds - graphic.durationSeconds)
    const nextStartSeconds = snapEditedTime(pointerSeconds - active.pointerOffsetSeconds, maxStartSeconds, snapPoints)
    const next = { ...active, startSeconds: nextStartSeconds, moved: active.moved || Math.abs(nextStartSeconds - active.startSeconds) > 0.01 }
    dragRef.current = next
    setDrag(next)
    event.preventDefault()
  }
  const finishDrag = (): void => {
    const active = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (!active?.moved) return
    suppressClickRef.current = true
    onMove(active.id, active.startSeconds)
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  const beginTrim = (event: ReactPointerEvent<HTMLSpanElement>, graphic: EditingGraphic, edge: EditingTrackTrimEdge): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-graphic-track"]')
    if (!(track instanceof HTMLElement)) return
    const next = { id: graphic.id, edge, startSeconds: graphic.startSeconds, endSeconds: graphic.startSeconds + graphic.durationSeconds, moved: false }
    trimRef.current = next
    setTrim(next)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveTrim = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    const active = trimRef.current
    if (!active) return
    const track = event.currentTarget.closest('[data-testid="editing-graphic-track"]')
    if (!(track instanceof HTMLElement)) return
    const next = updateEditingTrackTrim(active, editingTimeFromTimelinePointer(event.clientX, track, durationSeconds), durationSeconds, 0.2, snapPoints)
    trimRef.current = next
    setTrim(next)
    event.preventDefault()
  }

  const finishTrim = (): void => {
    const active = trimRef.current
    trimRef.current = null
    setTrim(null)
    if (!active?.moved) return
    suppressClickRef.current = true
    onResize(active.id, active.startSeconds, active.endSeconds)
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }
  const handleTrackDragOver = (event: DragEvent<HTMLDivElement>): void => {
    if (!event.dataTransfer.types.includes(EDITING_OVERLAY_TRACK_DRAG_TYPE)) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'move'
  }
  const handleTrackDrop = (event: DragEvent<HTMLDivElement>): void => {
    const source = readEditingOverlayTrackDrag(event)
    if (!source || source === trackKind) return
    event.preventDefault()
    onReorderTrack(source, trackKind)
  }
  return <div className="editing-track-row editing-graphic-row" data-editing-overlay-track={trackKind} onDragOver={handleTrackDragOver} onDrop={handleTrackDrop}>
    <button type="button" className="editing-track-label editing-track-reorder-handle" draggable title={trackLabel} aria-label={trackLabel} onDragStart={(event) => writeEditingOverlayTrackDrag(event, trackKind)}>{trackLabel}</button>
    <div className="editing-graphic-track" data-testid="editing-graphic-track">
      {graphics.length > 0 ? graphics.map((graphic) => {
        const startSeconds = trim?.id === graphic.id ? trim.startSeconds : drag?.id === graphic.id ? drag.startSeconds : graphic.startSeconds
        const endSeconds = trim?.id === graphic.id ? trim.endSeconds : graphic.startSeconds + graphic.durationSeconds
        const selected = selectedGraphicIds?.has(graphic.id) ?? selectedGraphicId === graphic.id
        return <div className={`editing-graphic-item is-${graphic.style} ${selected ? 'is-selected' : ''} ${drag?.id === graphic.id && drag.moved ? 'is-dragging' : ''}`} key={graphic.id} style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? ((endSeconds - startSeconds) / durationSeconds) * 100 : 0}%` }} data-editing-selection-kind="graphic" data-editing-selection-id={graphic.id}>
          <button type="button" className="editing-graphic-item-button" title={graphic.text} aria-label={`${formatTime(graphic.startSeconds)} ${graphic.text}`} onPointerDown={(event) => beginDrag(event, graphic)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelect(graphic.id, event.metaKey || event.ctrlKey) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(graphic.id, event.metaKey || event.ctrlKey); return } if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); const stepSeconds = event.shiftKey ? 1 : 0.1; onMove(graphic.id, snapEditedTime(graphic.startSeconds + (event.key === 'ArrowLeft' ? -stepSeconds : stepSeconds), Math.max(0, durationSeconds - graphic.durationSeconds), snapPoints)) }}>{graphic.text}</button>
          <button type="button" className="editing-graphic-item-delete" title={deleteLabel} aria-label={`${deleteLabel}: ${graphic.text}`} onClick={(event) => { event.stopPropagation(); onDelete(graphic.id) }}>×</button>
          <span className="editing-timeline-trim-handle editing-timeline-trim-handle-start" data-editing-trim-edge="start" role="presentation" onPointerDown={(event) => beginTrim(event, graphic, 'start')} onPointerMove={moveTrim} onPointerUp={finishTrim} onPointerCancel={finishTrim} />
          <span className="editing-timeline-trim-handle editing-timeline-trim-handle-end" data-editing-trim-edge="end" role="presentation" onPointerDown={(event) => beginTrim(event, graphic, 'end')} onPointerMove={moveTrim} onPointerUp={finishTrim} onPointerCancel={finishTrim} />
        </div>
      }) : <span className="editing-graphic-empty">{emptyLabel}</span>}
    </div>
  </div>
}
