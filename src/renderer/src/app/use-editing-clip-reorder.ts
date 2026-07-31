import { useRef, useState, type PointerEvent } from 'react'
import type { EditingVideoClipSpan } from '../../../core/editing/timeline-math'

type ClipReorderApp = { reorderEditingClips: (fromIndex: number, toIndex: number) => void }
type ClipDragState = { from: number; to: number; dx: number; moved: boolean; startX: number; startCenter: number; mids: number[] }

export function useEditingClipReorder(app: ClipReorderApp, spans: readonly EditingVideoClipSpan[], durationSeconds: number): {
  clipDrag: ClipDragState | null
  suppressClipClickRef: React.MutableRefObject<boolean>
  startClipDrag: (event: PointerEvent<HTMLButtonElement>, index: number) => void
  moveClipDrag: (event: PointerEvent<HTMLButtonElement>, index: number) => void
  finishClipDrag: () => void
} {
  const [clipDrag, setClipDrag] = useState<ClipDragState | null>(null)
  const clipDragRef = useRef<ClipDragState | null>(null)
  const suppressClipClickRef = useRef(false)

  const startClipDrag = (event: PointerEvent<HTMLButtonElement>, index: number): void => {
    if (event.button !== 0 || spans.length <= 1 || durationSeconds <= 0) return
    const track = event.currentTarget.closest('[data-testid="editing-track"]')
    if (!(track instanceof HTMLElement)) return
    const bounds = track.getBoundingClientRect()
    const startCenter = ((spans[index]!.editedStartSeconds + spans[index]!.editedEndSeconds) / 2 / durationSeconds) * bounds.width
    const mids = spans.map((span) => ((span.editedStartSeconds + span.editedEndSeconds) / 2 / durationSeconds) * bounds.width)
    const next = { from: index, to: index, dx: 0, moved: false, startX: event.clientX - bounds.left, startCenter, mids }
    clipDragRef.current = next; setClipDrag(next); event.stopPropagation(); event.currentTarget.setPointerCapture(event.pointerId)
  }

  const moveClipDrag = (event: PointerEvent<HTMLButtonElement>, index: number): void => {
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
    clipDragRef.current = next; setClipDrag(next); event.preventDefault()
  }

  const finishClipDrag = (): void => {
    const drag = clipDragRef.current
    clipDragRef.current = null; setClipDrag(null)
    if (!drag?.moved || drag.to === drag.from) return
    suppressClipClickRef.current = true
    app.reorderEditingClips(drag.from, drag.to)
    window.setTimeout(() => { suppressClipClickRef.current = false }, 0)
  }

  return { clipDrag, suppressClipClickRef, startClipDrag, moveClipDrag, finishClipDrag }
}
