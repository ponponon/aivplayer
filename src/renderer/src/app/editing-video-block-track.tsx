import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import type { EditingVideoBlock } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'

type Props = { blocks: readonly EditingVideoBlock[]; durationSeconds: number; selectedBlockId: string | null; trackLabel: string; emptyLabel: string; deleteLabel: string; onSelect: (blockId: string) => void; onDelete: (blockId: string) => void; onMove: (blockId: string, startSeconds: number) => void }
type DragState = { id: string; startSeconds: number; offsetSeconds: number; moved: boolean }

function clampStart(startSeconds: number, durationSeconds: number, blockDuration: number): number {
  return Math.min(Math.max(startSeconds, 0), Math.max(0, durationSeconds - blockDuration))
}

export function EditingVideoBlockTrack({ blocks, durationSeconds, selectedBlockId, trackLabel, emptyLabel, deleteLabel, onSelect, onDelete, onMove }: Props): React.ReactElement {
  const [drag, setDrag] = useState<DragState | null>(null)
  const dragRef = useRef<DragState | null>(null)
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
    const startSeconds = clampStart(pointerSeconds - active.offsetSeconds, durationSeconds, block.durationSeconds)
    const next = { ...active, startSeconds, moved: active.moved || Math.abs(startSeconds - active.startSeconds) > 0.01 }
    dragRef.current = next; setDrag(next); event.preventDefault()
  }
  const finishDrag = (): void => {
    const active = dragRef.current
    dragRef.current = null; setDrag(null)
    if (!active?.moved) return
    suppressClickRef.current = true; onMove(active.id, active.startSeconds); window.setTimeout(() => { suppressClickRef.current = false }, 0)
  }
  return <div className="editing-track-row editing-video-block-row"><span className="editing-track-label">{trackLabel}</span><div className="editing-video-block-track" data-testid="editing-video-block-track">{blocks.length > 0 ? blocks.map((block) => { const startSeconds = drag?.id === block.id ? drag.startSeconds : block.startSeconds; return <div className={`editing-video-block-item ${selectedBlockId === block.id ? 'is-selected' : ''} ${drag?.id === block.id && drag.moved ? 'is-dragging' : ''}`} key={block.id} style={{ left: `${durationSeconds > 0 ? (startSeconds / durationSeconds) * 100 : 0}%`, width: `${durationSeconds > 0 ? (block.durationSeconds / durationSeconds) * 100 : 0}%` }}><button type="button" className="editing-video-block-item-button" title={block.position} aria-label={`${formatTime(block.startSeconds)} ${trackLabel}`} onPointerDown={(event) => beginDrag(event, block)} onPointerMove={moveDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} onClick={(event) => { event.stopPropagation(); if (!suppressClickRef.current) onSelect(block.id) }} onKeyDown={(event) => { if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return; event.preventDefault(); event.stopPropagation(); onMove(block.id, block.startSeconds + (event.key === 'ArrowLeft' ? -0.1 : 0.1)) }}>PiP · {formatTime(block.durationSeconds)}</button><button type="button" className="editing-video-block-item-delete" title={deleteLabel} aria-label={deleteLabel} onClick={(event) => { event.stopPropagation(); onDelete(block.id) }}>×</button></div> }) : <span className="editing-video-block-empty">{emptyLabel}</span>}</div></div>
}
