import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditingCaption } from '../../../shared/editing-types'

type CaptionDragState = {
  id: string
  startSeconds: number
  pointerOffsetSeconds: number
  moved: boolean
}

type EditingCaptionTrackProps = {
  captions: readonly EditingCaption[]
  durationSeconds: number
  selectedCaptionId: string | null
  emptyLabel: string
  onSelectCaption: (captionId: string) => void
  onMoveCaption: (captionId: string, startSeconds: number) => void
}

function clampStart(startSeconds: number, durationSeconds: number, captionDuration: number): number {
  return Math.min(Math.max(startSeconds, 0), Math.max(0, durationSeconds - captionDuration))
}

export function EditingCaptionTrack({ captions, durationSeconds, selectedCaptionId, emptyLabel, onSelectCaption, onMoveCaption }: EditingCaptionTrackProps): React.ReactElement {
  const [drag, setDrag] = useState<CaptionDragState | null>(null)
  const dragRef = useRef<CaptionDragState | null>(null)
  const suppressClickRef = useRef(false)

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, caption: EditingCaption): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.parentElement
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const captionStartPixels = (caption.startSeconds / durationSeconds) * bounds.width
    const pointerOffsetSeconds = ((event.clientX - bounds.left) - captionStartPixels) / Math.max(1, bounds.width) * durationSeconds
    const next = { id: caption.id, startSeconds: caption.startSeconds, pointerOffsetSeconds, moved: false }
    dragRef.current = next
    setDrag(next)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const active = dragRef.current
    if (!active) return
    const track = event.currentTarget.parentElement
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const pointerSeconds = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * durationSeconds
    const nextStartSeconds = clampStart(pointerSeconds - active.pointerOffsetSeconds, durationSeconds, captions.find((caption) => caption.id === active.id)?.durationSeconds ?? 0)
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
    onMoveCaption(active.id, active.startSeconds)
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  return <div className="editing-caption-track" data-testid="editing-caption-track">
    {captions.length > 0 ? captions.map((caption) => {
      const startSeconds = drag?.id === caption.id ? drag.startSeconds : caption.startSeconds
      return <button
        key={caption.id}
        className={`editing-caption-item ${caption.kind === 'translation' ? 'is-translation' : ''} ${selectedCaptionId === caption.id ? 'is-selected' : ''} ${drag?.id === caption.id && drag.moved ? 'is-dragging' : ''}`}
        type="button"
        style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? (caption.durationSeconds / durationSeconds) * 100 : 0}%` }}
        title={caption.text}
        aria-label={caption.text}
        onPointerDown={(event) => beginDrag(event, caption)}
        onPointerMove={moveDrag}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelectCaption(caption.id) }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCaption(caption.id); return }
          if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
          event.preventDefault()
          event.stopPropagation()
          onMoveCaption(caption.id, caption.startSeconds + (event.key === 'ArrowLeft' ? -0.1 : 0.1))
        }}
      >{caption.text}</button>
    }) : <span className="editing-caption-empty">{emptyLabel}</span>}
  </div>
}
