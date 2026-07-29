import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditingGraphic } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'

type EditingGraphicTrackProps = {
  graphics: readonly EditingGraphic[]
  durationSeconds: number
  selectedGraphicId: string | null
  trackLabel: string
  emptyLabel: string
  deleteLabel: string
  onSelect: (graphicId: string) => void
  onDelete: (graphicId: string) => void
  onMove: (graphicId: string, startSeconds: number) => void
}

type GraphicDragState = { id: string; startSeconds: number; pointerOffsetSeconds: number; moved: boolean }

function clampStart(startSeconds: number, durationSeconds: number, graphicDuration: number): number {
  return Math.min(Math.max(startSeconds, 0), Math.max(0, durationSeconds - graphicDuration))
}

export function EditingGraphicTrack({ graphics, durationSeconds, selectedGraphicId, trackLabel, emptyLabel, deleteLabel, onSelect, onDelete, onMove }: EditingGraphicTrackProps): React.ReactElement {
  const [drag, setDrag] = useState<GraphicDragState | null>(null)
  const dragRef = useRef<GraphicDragState | null>(null)
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
    const nextStartSeconds = clampStart(pointerSeconds - active.pointerOffsetSeconds, durationSeconds, graphic.durationSeconds)
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
  return <div className="editing-track-row editing-graphic-row">
    <span className="editing-track-label">{trackLabel}</span>
    <div className="editing-graphic-track" data-testid="editing-graphic-track">
      {graphics.length > 0 ? graphics.map((graphic) => {
        const startSeconds = drag?.id === graphic.id ? drag.startSeconds : graphic.startSeconds
        return <div className={`editing-graphic-item is-${graphic.style} ${selectedGraphicId === graphic.id ? 'is-selected' : ''} ${drag?.id === graphic.id && drag.moved ? 'is-dragging' : ''}`} key={graphic.id} style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? (graphic.durationSeconds / durationSeconds) * 100 : 0}%` }}>
          <button type="button" className="editing-graphic-item-button" title={graphic.text} aria-label={`${formatTime(graphic.startSeconds)} ${graphic.text}`} onPointerDown={(event) => beginDrag(event, graphic)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelect(graphic.id) }} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(graphic.id); return } if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); onMove(graphic.id, graphic.startSeconds + (event.key === 'ArrowLeft' ? -0.1 : 0.1)) }}>{graphic.text}</button>
          <button type="button" className="editing-graphic-item-delete" title={deleteLabel} aria-label={`${deleteLabel}: ${graphic.text}`} onClick={(event) => { event.stopPropagation(); onDelete(graphic.id) }}>×</button>
        </div>
      }) : <span className="editing-graphic-empty">{emptyLabel}</span>}
    </div>
  </div>
}
