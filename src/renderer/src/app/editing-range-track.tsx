import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { snapEditedTime } from '../../../core/editing/timeline-snapping'
import { EDITING_SOURCE_DRAG_TYPE, readEditingSourceDrag } from './editing-asset-dnd'

export type EditingTimeRange = { startSeconds: number; endSeconds: number }

type RangeDrag = { startSeconds: number; moved: boolean }
type PlayheadDrag = { pointerId: number }

type EditingRangeTrackProps = {
  durationSeconds: number
  currentTime: number
  trackLabel: string
  deleteRangeLabel: string
  onSeek: (seconds: number) => void
  onDeleteRange: (startSeconds: number, endSeconds: number) => void
  onDropSource?: (sourceId: string, seconds: number) => void
  snapPoints?: readonly number[]
  children: ReactNode
}

const MIN_RANGE_SECONDS = 0.05

function timeFromPointer(clientX: number, element: HTMLElement, durationSeconds: number): number {
  const bounds = element.getBoundingClientRect()
  const ratio = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0
  return Math.min(Math.max(0, ratio * durationSeconds), durationSeconds)
}

function normalizeRange(startSeconds: number, endSeconds: number): EditingTimeRange {
  return startSeconds <= endSeconds ? { startSeconds, endSeconds } : { startSeconds: endSeconds, endSeconds: startSeconds }
}

export function EditingRangeTrack({ durationSeconds, currentTime, trackLabel, deleteRangeLabel, onSeek, onDeleteRange, onDropSource, snapPoints = [], children }: EditingRangeTrackProps): React.ReactElement {
  const [selectedRange, setSelectedRange] = useState<EditingTimeRange | null>(null)
  const [isPlayheadDragging, setIsPlayheadDragging] = useState(false)
  const dragRef = useRef<RangeDrag | null>(null)
  const playheadDragRef = useRef<PlayheadDrag | null>(null)
  const rangeRef = useRef<EditingTimeRange | null>(null)
  const suppressSeekRef = useRef(false)

  useEffect(() => {
    setSelectedRange((current) => {
      if (!current || durationSeconds <= 0) return null
      const next = normalizeRange(Math.min(current.startSeconds, durationSeconds), Math.min(current.endSeconds, durationSeconds))
      return next.endSeconds - next.startSeconds >= MIN_RANGE_SECONDS ? next : null
    })
  }, [durationSeconds])

  const updateRange = (next: EditingTimeRange | null): void => {
    rangeRef.current = next
    setSelectedRange(next)
  }

  const startRangeDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const target = event.target
    if (event.button !== 0 || durationSeconds <= 0 || (target instanceof Element && target.closest('.editing-clip, .editing-range-delete, .editing-clip-boundary-handle'))) return
    const startSeconds = snapEditedTime(timeFromPointer(event.clientX, event.currentTarget, durationSeconds), durationSeconds, snapPoints)
    dragRef.current = { startSeconds, moved: false }
    updateRange(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveRangeDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const currentSeconds = snapEditedTime(timeFromPointer(event.clientX, event.currentTarget, durationSeconds), durationSeconds, snapPoints)
    const moved = drag.moved || Math.abs(currentSeconds - drag.startSeconds) >= MIN_RANGE_SECONDS
    dragRef.current = { ...drag, moved }
    if (moved) updateRange(normalizeRange(drag.startSeconds, currentSeconds))
  }

  const finishRangeDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag?.moved) return
    const range = rangeRef.current
    if (!range || range.endSeconds - range.startSeconds < MIN_RANGE_SECONDS) {
      updateRange(null)
      return
    }
    suppressSeekRef.current = true
  }

  const deleteSelectedRange = (): void => {
    const range = rangeRef.current
    if (!range) return
    updateRange(null)
    onDeleteRange(range.startSeconds, range.endSeconds)
  }

  const seekFromPlayheadPointer = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const track = event.currentTarget.closest('[data-testid="editing-track"]')
    if (!(track instanceof HTMLElement)) return
    onSeek(snapEditedTime(timeFromPointer(event.clientX, track, durationSeconds), durationSeconds, snapPoints))
  }

  const startPlayheadDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    playheadDragRef.current = { pointerId: event.pointerId }
    setIsPlayheadDragging(true)
    event.preventDefault()
    event.stopPropagation()
    seekFromPlayheadPointer(event)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const movePlayheadDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = playheadDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    event.preventDefault()
    event.stopPropagation()
    seekFromPlayheadPointer(event)
  }

  const finishPlayheadDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const drag = playheadDragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    playheadDragRef.current = null
    setIsPlayheadDragging(false)
    event.stopPropagation()
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }

  const handlePlayheadKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    onSeek(snapEditedTime(currentTime + (event.key === 'ArrowLeft' ? -0.1 : 0.1), durationSeconds, snapPoints))
  }

  const handleSourceDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    const sourceId = readEditingSourceDrag(event)
    if (!sourceId || !onDropSource) return
    event.preventDefault()
    onDropSource(sourceId, timeFromPointer(event.clientX, event.currentTarget, durationSeconds))
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!rangeRef.current) return
      event.preventDefault()
      deleteSelectedRange()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onSeek(snapEditedTime((rangeRef.current?.startSeconds ?? currentTime) + (event.key === 'ArrowLeft' ? -0.1 : 0.1), durationSeconds, snapPoints))
  }

  const range = selectedRange
  const rangeLeft = range && durationSeconds > 0 ? (range.startSeconds / durationSeconds) * 100 : 0
  const rangeWidth = range && durationSeconds > 0 ? ((range.endSeconds - range.startSeconds) / durationSeconds) * 100 : 0

  return (
    <div
      className="editing-track"
      role="group"
      tabIndex={0}
      aria-label={trackLabel}
      onClick={(event) => {
        if (suppressSeekRef.current) { suppressSeekRef.current = false; return }
        onSeek(snapEditedTime(timeFromPointer(event.clientX, event.currentTarget, durationSeconds), durationSeconds, snapPoints))
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={startRangeDrag}
      onPointerMove={moveRangeDrag}
      onPointerUp={finishRangeDrag}
      onPointerCancel={finishRangeDrag}
      onDragOver={(event) => { if (event.dataTransfer.types.includes(EDITING_SOURCE_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }}
      onDrop={handleSourceDrop}
      data-testid="editing-track"
    >
      {range ? <div className="editing-range-selection" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}><button className="editing-range-delete" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={deleteSelectedRange} title={deleteRangeLabel} aria-label={deleteRangeLabel}><Trash2 size={13} /></button></div> : null}
      {children}
      <button
        className={`editing-playhead${isPlayheadDragging ? ' is-dragging' : ''}`}
        type="button"
        role="slider"
        tabIndex={0}
        aria-label={trackLabel}
        aria-valuemin={0}
        aria-valuemax={durationSeconds}
        aria-valuenow={currentTime}
        title={trackLabel}
        data-testid="editing-playhead"
        style={{ left: `${durationSeconds > 0 ? Math.min(100, Math.max(0, (currentTime / durationSeconds) * 100)) : 0}%` }}
        onPointerDown={startPlayheadDrag}
        onPointerMove={movePlayheadDrag}
        onPointerUp={finishPlayheadDrag}
        onPointerCancel={finishPlayheadDrag}
        onKeyDown={handlePlayheadKeyDown}
        onClick={(event) => event.stopPropagation()}
      ><span aria-hidden="true" /></button>
    </div>
  )
}
