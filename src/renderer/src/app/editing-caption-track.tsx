import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditingSubtitleReloadIncomingPreview } from '../../../core/editing/subtitle-reload'
import { snapEditedTime } from '../../../core/editing/timeline-snapping'
import type { EditingCaption, EditingOverlayTrackKind } from '../../../shared/editing-types'
import { EDITING_OVERLAY_TRACK_DRAG_TYPE, readEditingOverlayTrackDrag, writeEditingOverlayTrackDrag } from './editing-overlay-track-dnd'
import { editingTimeFromTimelinePointer, type EditingTrackTrimEdge, type EditingTrackTrimState, updateEditingTrackTrim } from './editing-track-trim'

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
  selectedCaptionIds?: ReadonlySet<string>
  trackLabel: string
  trackKind: EditingOverlayTrackKind
  onReorderTrack: (source: EditingOverlayTrackKind, target: EditingOverlayTrackKind) => void
  emptyLabel: string
  snapPoints?: readonly number[]
  onSelectCaption: (captionId: string, additive?: boolean) => void
  onMoveCaption: (captionId: string, startSeconds: number) => void
  onResizeCaption: (captionId: string, startSeconds: number, endSeconds: number) => void
  incomingPreview?: EditingSubtitleReloadIncomingPreview | null
  incomingPreviewLabel?: string
}

export function EditingCaptionTrack({ captions, durationSeconds, selectedCaptionId, selectedCaptionIds, trackLabel, trackKind, onReorderTrack, emptyLabel, snapPoints = [], onSelectCaption, onMoveCaption, onResizeCaption, incomingPreview, incomingPreviewLabel = 'Incoming subtitle preview' }: EditingCaptionTrackProps): React.ReactElement {
  const [drag, setDrag] = useState<CaptionDragState | null>(null)
  const dragRef = useRef<CaptionDragState | null>(null)
  const [trim, setTrim] = useState<EditingTrackTrimState | null>(null)
  const trimRef = useRef<EditingTrackTrimState | null>(null)
  const suppressClickRef = useRef(false)

  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, caption: EditingCaption): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-caption-track"]')
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
    const track = event.currentTarget.closest('[data-testid="editing-caption-track"]')
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const pointerSeconds = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * durationSeconds
    const captionDuration = captions.find((caption) => caption.id === active.id)?.durationSeconds ?? 0
    const maxStartSeconds = Math.max(0, durationSeconds - captionDuration)
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
    onMoveCaption(active.id, active.startSeconds)
    window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  const beginTrim = (event: ReactPointerEvent<HTMLSpanElement>, caption: EditingCaption, edge: EditingTrackTrimEdge): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.parentElement
    if (!(track instanceof HTMLElement)) return
    const next = { id: caption.id, edge, startSeconds: caption.startSeconds, endSeconds: caption.startSeconds + caption.durationSeconds, moved: false }
    trimRef.current = next
    setTrim(next)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveTrim = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    const active = trimRef.current
    if (!active) return
    const track = event.currentTarget.parentElement
    if (!(track instanceof HTMLElement)) return
    const next = updateEditingTrackTrim(active, editingTimeFromTimelinePointer(event.clientX, track, durationSeconds), durationSeconds, 0.1, snapPoints)
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
    onResizeCaption(active.id, active.startSeconds, active.endSeconds)
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

  return <div className="editing-track-row editing-caption-row" data-editing-overlay-track={trackKind} onDragOver={handleTrackDragOver} onDrop={handleTrackDrop}>
    <button type="button" className="editing-track-label editing-track-reorder-handle" draggable title={trackLabel} aria-label={trackLabel} onDragStart={(event) => writeEditingOverlayTrackDrag(event, trackKind)}>{trackLabel}</button>
    <div className="editing-caption-track" data-testid="editing-caption-track">
    {captions.length > 0 ? captions.map((caption) => {
      const startSeconds = trim?.id === caption.id ? trim.startSeconds : drag?.id === caption.id ? drag.startSeconds : caption.startSeconds
      const endSeconds = trim?.id === caption.id ? trim.endSeconds : caption.startSeconds + caption.durationSeconds
      const selected = selectedCaptionIds?.has(caption.id) ?? selectedCaptionId === caption.id
      return <div
        key={caption.id}
        className={`editing-caption-item ${caption.kind === 'translation' ? 'is-translation' : ''} ${selected ? 'is-selected' : ''} ${drag?.id === caption.id && drag.moved ? 'is-dragging' : ''}`}
        style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? ((endSeconds - startSeconds) / durationSeconds) * 100 : 0}%` }}
        data-editing-selection-kind="caption"
        data-editing-selection-id={caption.id}
        data-testid={`editing-caption-item-${caption.id}`}
      >
        <button
          className="editing-caption-item-button"
          type="button"
          title={caption.text}
          aria-label={caption.text}
          onPointerDown={(event) => beginDrag(event, caption)}
          onPointerMove={moveDrag}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelectCaption(caption.id, event.metaKey || event.ctrlKey) }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectCaption(caption.id); return }
            if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
            event.preventDefault()
            event.stopPropagation()
            const stepSeconds = event.shiftKey ? 1 : 0.1
            onMoveCaption(caption.id, snapEditedTime(caption.startSeconds + (event.key === 'ArrowLeft' ? -stepSeconds : stepSeconds), Math.max(0, durationSeconds - caption.durationSeconds), snapPoints))
          }}
        >{caption.text}</button>
        <span className="editing-timeline-trim-handle editing-timeline-trim-handle-start" data-editing-trim-edge="start" role="presentation" onPointerDown={(event) => beginTrim(event, caption, 'start')} onPointerMove={moveTrim} onPointerUp={finishTrim} onPointerCancel={finishTrim} />
        <span className="editing-timeline-trim-handle editing-timeline-trim-handle-end" data-editing-trim-edge="end" role="presentation" onPointerDown={(event) => beginTrim(event, caption, 'end')} onPointerMove={moveTrim} onPointerUp={finishTrim} onPointerCancel={finishTrim} />
      </div>
    }) : <span className="editing-caption-empty">{emptyLabel}</span>}
    {incomingPreview ? (() => {
      const startSeconds = Math.min(durationSeconds, Math.max(0, incomingPreview.startSeconds))
      const endSeconds = Math.max(startSeconds, Math.min(durationSeconds, incomingPreview.endSeconds))
      return <div className={`editing-caption-item editing-caption-item-incoming-preview ${incomingPreview.kind === 'translation' ? 'is-translation' : ''}`} style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? ((endSeconds - startSeconds) / durationSeconds) * 100 : 0}%` }} data-testid="editing-caption-incoming-preview" data-preview-id={incomingPreview.id} role="status" aria-label={`${incomingPreviewLabel}: ${incomingPreview.text}`}><span className="editing-caption-incoming-preview-label">{incomingPreviewLabel}</span><span className="editing-caption-incoming-preview-text">{incomingPreview.text}</span></div>
    })() : null}
    </div>
  </div>
}
