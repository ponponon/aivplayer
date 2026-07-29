import { useRef, useState } from 'react'
import type { EditingVideoClipSpan } from '../../../core/editing/timeline-math'
import type { EditingClipBoundary } from '../../../core/editing/timeline-operations'

type BoundaryDrag = {
  boundary: EditingClipBoundary
  currentSeconds: number
  moved: boolean
}

type EditingClipBoundaryHandlesProps = {
  span: EditingVideoClipSpan
  durationSeconds: number
  startLabel: string
  endLabel: string
  onCommit: (clipId: string, boundary: EditingClipBoundary, editedSeconds: number) => void
}

const MIN_DRAG_SECONDS = 0.05

function clampEditedSeconds(clientX: number, track: HTMLElement, durationSeconds: number): number {
  const bounds = track.getBoundingClientRect()
  const ratio = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0
  return Math.min(Math.max(0, ratio * durationSeconds), durationSeconds)
}

export function EditingClipBoundaryHandles({ span, durationSeconds, startLabel, endLabel, onCommit }: EditingClipBoundaryHandlesProps): React.ReactElement {
  const [drag, setDrag] = useState<BoundaryDrag | null>(null)
  const dragRef = useRef<BoundaryDrag | null>(null)
  const getPreviewSeconds = (boundary: EditingClipBoundary): number => {
    if (drag?.boundary === boundary) return drag.currentSeconds
    return boundary === 'start' ? span.editedStartSeconds : span.editedEndSeconds
  }

  const startDrag = (event: React.PointerEvent<HTMLButtonElement>, boundary: EditingClipBoundary): void => {
    const track = event.currentTarget.closest('[data-testid="editing-track"]')
    if (event.button !== 0 || !(track instanceof HTMLElement) || durationSeconds <= 0) return
    const currentSeconds = clampEditedSeconds(event.clientX, track, durationSeconds)
    const next = { boundary, currentSeconds, moved: false }
    dragRef.current = next
    setDrag(next)
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: React.PointerEvent<HTMLButtonElement>): void => {
    const current = dragRef.current
    const track = event.currentTarget.closest('[data-testid="editing-track"]')
    if (!current || !(track instanceof HTMLElement)) return
    const currentSeconds = clampEditedSeconds(event.clientX, track, durationSeconds)
    const originalSeconds = current.boundary === 'start' ? span.editedStartSeconds : span.editedEndSeconds
    const next = { ...current, currentSeconds, moved: current.moved || Math.abs(currentSeconds - originalSeconds) >= MIN_DRAG_SECONDS }
    dragRef.current = next
    setDrag(next)
    event.preventDefault()
    event.stopPropagation()
  }

  const finishDrag = (event: React.PointerEvent<HTMLButtonElement>, commit: boolean): void => {
    const current = dragRef.current
    dragRef.current = null
    setDrag(null)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    event.stopPropagation()
    if (commit && current?.moved) onCommit(span.clip.id, current.boundary, current.currentSeconds)
  }

  const moveWithKeyboard = (boundary: EditingClipBoundary, event: React.KeyboardEvent<HTMLButtonElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    event.stopPropagation()
    const delta = event.key === 'ArrowLeft' ? -0.1 : 0.1
    const currentSeconds = boundary === 'start' ? span.editedStartSeconds : span.editedEndSeconds
    onCommit(span.clip.id, boundary, currentSeconds + delta)
  }

  const startPercent = durationSeconds > 0 ? (getPreviewSeconds('start') / durationSeconds) * 100 : 0
  const endPercent = durationSeconds > 0 ? (getPreviewSeconds('end') / durationSeconds) * 100 : 0
  const createHandle = (boundary: EditingClipBoundary, label: string, percent: number): React.ReactElement => <button
    className={`editing-clip-boundary-handle editing-clip-boundary-handle-${boundary}`}
    type="button"
    style={{ left: `${percent}%` }}
    aria-label={label}
    title={label}
    data-testid={`editing-clip-boundary-${boundary}-${span.clip.id}`}
    onPointerDown={(event) => startDrag(event, boundary)}
    onPointerMove={moveDrag}
    onPointerUp={(event) => finishDrag(event, true)}
    onPointerCancel={(event) => finishDrag(event, false)}
    onClick={(event) => event.stopPropagation()}
    onKeyDown={(event) => moveWithKeyboard(boundary, event)}
  ><span aria-hidden="true" /></button>

  return <>{createHandle('start', startLabel, startPercent)}{createHandle('end', endLabel, endPercent)}</>
}
