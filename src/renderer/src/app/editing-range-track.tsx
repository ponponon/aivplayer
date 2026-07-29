import { Trash2 } from 'lucide-react'
import { useEffect, useRef, useState, type ReactNode } from 'react'

export type EditingTimeRange = { startSeconds: number; endSeconds: number }

type RangeDrag = { startSeconds: number; moved: boolean }

type EditingRangeTrackProps = {
  durationSeconds: number
  currentTime: number
  trackLabel: string
  deleteRangeLabel: string
  onSeek: (seconds: number) => void
  onDeleteRange: (startSeconds: number, endSeconds: number) => void
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

export function EditingRangeTrack({ durationSeconds, currentTime, trackLabel, deleteRangeLabel, onSeek, onDeleteRange, children }: EditingRangeTrackProps): React.ReactElement {
  const [selectedRange, setSelectedRange] = useState<EditingTimeRange | null>(null)
  const dragRef = useRef<RangeDrag | null>(null)
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
    const startSeconds = timeFromPointer(event.clientX, event.currentTarget, durationSeconds)
    dragRef.current = { startSeconds, moved: false }
    updateRange(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveRangeDrag = (event: React.PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current
    if (!drag) return
    const currentSeconds = timeFromPointer(event.clientX, event.currentTarget, durationSeconds)
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

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Delete' || event.key === 'Backspace') {
      if (!rangeRef.current) return
      event.preventDefault()
      deleteSelectedRange()
      return
    }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    onSeek(Math.max(0, Math.min(durationSeconds, (rangeRef.current?.startSeconds ?? currentTime) + (event.key === 'ArrowLeft' ? -0.1 : 0.1))))
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
        onSeek(timeFromPointer(event.clientX, event.currentTarget, durationSeconds))
      }}
      onKeyDown={handleKeyDown}
      onPointerDown={startRangeDrag}
      onPointerMove={moveRangeDrag}
      onPointerUp={finishRangeDrag}
      onPointerCancel={finishRangeDrag}
      data-testid="editing-track"
    >
      {range ? <div className="editing-range-selection" style={{ left: `${rangeLeft}%`, width: `${rangeWidth}%` }}><button className="editing-range-delete" type="button" onPointerDown={(event) => event.stopPropagation()} onClick={deleteSelectedRange} title={deleteRangeLabel} aria-label={deleteRangeLabel}><Trash2 size={13} /></button></div> : null}
      {children}
    </div>
  )
}
