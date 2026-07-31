import { useRef, useState, type DragEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { snapEditedTime } from '../../../core/editing/timeline-snapping'
import type { EditingOverlayTrackKind, EditingVideoBlock } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'
import { EDITING_SOURCE_DRAG_TYPE, readEditingSourceDrag } from './editing-asset-dnd'
import { EDITING_OVERLAY_TRACK_DRAG_TYPE, readEditingOverlayTrackDrag, writeEditingOverlayTrackDrag } from './editing-overlay-track-dnd'
import { editingTimeFromTimelinePointer, type EditingTrackTrimEdge, type EditingTrackTrimState, updateEditingTrackTrim } from './editing-track-trim'

type Props = { blocks: readonly EditingVideoBlock[]; durationSeconds: number; selectedBlockId: string | null; selectedBlockIds?: ReadonlySet<string>; trackLabel: string; trackKind: EditingOverlayTrackKind; onReorderTrack: (source: EditingOverlayTrackKind, target: EditingOverlayTrackKind) => void; emptyLabel: string; deleteLabel: string; snapPoints?: readonly number[]; onSelect: (blockId: string, additive?: boolean) => void; onDelete: (blockId: string) => void; onMove: (blockId: string, startSeconds: number) => void; onResize: (blockId: string, startSeconds: number, endSeconds: number) => void; onDropSource?: (sourceId: string, seconds: number) => void }
type DragState = { id: string; startSeconds: number; offsetSeconds: number; moved: boolean }

function timeFromPointer(clientX: number, element: HTMLElement, durationSeconds: number): number {
  const bounds = element.getBoundingClientRect()
  const ratio = bounds.width > 0 ? (clientX - bounds.left) / bounds.width : 0
  return Math.min(Math.max(0, ratio * durationSeconds), durationSeconds)
}

export function EditingVideoBlockTrack({ blocks, durationSeconds, selectedBlockId, selectedBlockIds, trackLabel, trackKind, onReorderTrack, emptyLabel, deleteLabel, snapPoints = [], onSelect, onDelete, onMove, onResize, onDropSource }: Props): React.ReactElement {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [trim, setTrim] = useState<EditingTrackTrimState | null>(null)
  const trimRef = useRef<EditingTrackTrimState | null>(null)
  const suppressClickRef = useRef(false)
  const beginDrag = (event: ReactPointerEvent<HTMLButtonElement>, block: EditingVideoBlock): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-video-block-track"]')
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const startPixels = (block.startSeconds / durationSeconds) * bounds.width
    const offsetSeconds = ((event.clientX - bounds.left) - startPixels) / Math.max(1, bounds.width) * durationSeconds
    const next = { id: block.id, startSeconds: block.startSeconds, offsetSeconds, moved: false }
    dragRef.current = next; setDrag(next); event.preventDefault(); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<HTMLButtonElement>): void => {
    const active = dragRef.current
    if (!active) return
    const track = event.currentTarget.closest('[data-testid="editing-video-block-track"]')
    const block = blocks.find((candidate) => candidate.id === active.id)
    if (!(track instanceof HTMLElement) || !block) return
    const bounds = track.getBoundingClientRect()
    const pointerSeconds = ((event.clientX - bounds.left) / Math.max(1, bounds.width)) * durationSeconds
    const maxStartSeconds = Math.max(0, durationSeconds - block.durationSeconds)
    const startSeconds = snapEditedTime(pointerSeconds - active.offsetSeconds, maxStartSeconds, snapPoints)
    const next = { ...active, startSeconds, moved: active.moved || Math.abs(startSeconds - active.startSeconds) > 0.01 }
    dragRef.current = next; setDrag(next); event.preventDefault()
  }
  const finishDrag = (): void => {
    const active = dragRef.current
    dragRef.current = null; setDrag(null)
    if (!active?.moved) return
    suppressClickRef.current = true; onMove(active.id, active.startSeconds); window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }

  const beginTrim = (event: ReactPointerEvent<HTMLSpanElement>, block: EditingVideoBlock, edge: EditingTrackTrimEdge): void => {
    if (event.button !== 0 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-video-block-track"]')
    if (!(track instanceof HTMLElement)) return
    const next = { id: block.id, edge, startSeconds: block.startSeconds, endSeconds: block.startSeconds + block.durationSeconds, moved: false }
    trimRef.current = next
    setTrim(next)
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveTrim = (event: ReactPointerEvent<HTMLSpanElement>): void => {
    const active = trimRef.current
    if (!active) return
    const track = event.currentTarget.closest('[data-testid="editing-video-block-track"]')
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
  const handleSourceDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    const sourceId = readEditingSourceDrag(event)
    if (!sourceId || !onDropSource) return
    event.preventDefault()
    onDropSource(sourceId, timeFromPointer(event.clientX, event.currentTarget, durationSeconds))
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
  return <div className="editing-track-row editing-video-block-row" data-editing-overlay-track={trackKind} onDragOver={handleTrackDragOver} onDrop={handleTrackDrop}><button type="button" className="editing-track-label editing-track-reorder-handle" draggable title={trackLabel} aria-label={trackLabel} onDragStart={(event) => writeEditingOverlayTrackDrag(event, trackKind)}>{trackLabel}</button><div className="editing-video-block-track" data-testid="editing-video-block-track" onDragOver={(event) => { if (event.dataTransfer.types.includes(EDITING_SOURCE_DRAG_TYPE)) { event.preventDefault(); event.dataTransfer.dropEffect = 'copy' } }} onDrop={handleSourceDrop}>{blocks.length > 0 ? blocks.map((block) => { const startSeconds = trim?.id === block.id ? trim.startSeconds : drag?.id === block.id ? drag.startSeconds : block.startSeconds; const endSeconds = trim?.id === block.id ? trim.endSeconds : block.startSeconds + block.durationSeconds; const selected = selectedBlockIds?.has(block.id) ?? selectedBlockId === block.id; return <div className={`editing-video-block-item ${selected ? 'is-selected' : ''} ${drag?.id === block.id && drag.moved ? 'is-dragging' : ''}`} key={block.id} style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? ((endSeconds - startSeconds) / durationSeconds) * 100 : 0}%` }} data-editing-selection-kind="videoBlock" data-editing-selection-id={block.id}><button type="button" className="editing-video-block-item-button" title={block.position} aria-label={`${formatTime(block.startSeconds)} ${trackLabel}`} onPointerDown={(event) => beginDrag(event, block)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelect(block.id, event.metaKey || event.ctrlKey) }} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); const stepSeconds = event.shiftKey ? 1 : 0.1; onMove(block.id, snapEditedTime(block.startSeconds + (event.key === 'ArrowLeft' ? -stepSeconds : stepSeconds), Math.max(0, durationSeconds - block.durationSeconds), snapPoints)) }}>PiP · {formatTime(block.durationSeconds)}</button><button type="button" className="editing-video-block-item-delete" title={deleteLabel} aria-label={deleteLabel} onClick={(event) => { event.stopPropagation(); onDelete(block.id) }}>×</button><span className="editing-timeline-trim-handle editing-timeline-trim-handle-start" data-editing-trim-edge="start" role="presentation" onPointerDown={(event) => beginTrim(event, block, 'start')} onPointerMove={moveTrim} onPointerUp={finishTrim} onPointerCancel={finishTrim} /><span className="editing-timeline-trim-handle editing-timeline-trim-handle-end" data-editing-trim-edge="end" role="presentation" onPointerDown={(event) => beginTrim(event, block, 'end')} onPointerMove={moveTrim} onPointerUp={finishTrim} onPointerCancel={finishTrim} /></div> }) : <span className="editing-video-block-empty">{emptyLabel}</span>}</div></div>
}
