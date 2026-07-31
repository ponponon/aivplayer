import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getEditingCaptionLayout, updateEditingCaptionLayout, type EditingCaptionLayoutDragMode, type EditingCaptionLine } from '../../../core/editing/caption-layout'
import type { EditingCaptionLineLayout } from '../../../shared/editing-types'

type Props = {
  line: EditingCaptionLine
  layout: EditingCaptionLineLayout
  hint: string
  onChange: (patch: Partial<EditingCaptionLineLayout>) => void
}

type DragState = {
  mode: EditingCaptionLayoutDragMode
  pointerId: number
  startX: number
  startY: number
  base: EditingCaptionLineLayout
  width: number
  height: number
}

function hasLayoutChanged(before: EditingCaptionLineLayout, after: EditingCaptionLineLayout): boolean {
  return before.xPercent !== after.xPercent || before.yPercent !== after.yPercent || before.widthPercent !== after.widthPercent
}

export function EditingCaptionCanvasOverlay({ line, layout, hint, onChange }: Props): React.ReactElement {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const liveLayoutRef = useRef<EditingCaptionLineLayout | null>(null)
  const onChangeRef = useRef(onChange)
  const updateDragAtRef = useRef<(clientX: number, clientY: number) => void>(() => {})
  const finishDragRef = useRef<() => void>(() => {})
  onChangeRef.current = onChange
  const [liveLayout, setLiveLayout] = useState<EditingCaptionLineLayout | null>(null)
  const effectiveLayout = liveLayout ?? layout
  const isDragging = liveLayout !== null
  const isCentered = isDragging && Math.abs(effectiveLayout.xPercent - 50) < 0.01

  const finishDrag = (): void => {
    const drag = dragRef.current
    if (!drag) return
    const finalLayout = liveLayoutRef.current ?? drag.base
    dragRef.current = null
    liveLayoutRef.current = null
    setLiveLayout(null)
    if (hasLayoutChanged(drag.base, finalLayout)) onChangeRef.current({
      xPercent: finalLayout.xPercent,
      yPercent: finalLayout.yPercent,
      widthPercent: finalLayout.widthPercent
    })
  }

  const beginDrag = (event: React.PointerEvent<HTMLElement>, mode: EditingCaptionLayoutDragMode): void => {
    event.preventDefault()
    event.stopPropagation()
    const stage = stageRef.current?.parentElement
    if (!stage) return
    const bounds = stage.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const base = getEditingCaptionLayout(layout)
    dragRef.current = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, base, width: bounds.width, height: bounds.height }
    liveLayoutRef.current = base
    setLiveLayout(base)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer capture is not available in older WebKit */ }
  }

  const updateDragAt = (clientX: number, clientY: number): void => {
    const drag = dragRef.current
    if (!drag) return
    const next = updateEditingCaptionLayout(
      drag.base,
      drag.mode,
      ((clientX - drag.startX) / drag.width) * 100,
      ((clientY - drag.startY) / drag.height) * 100
    )
    liveLayoutRef.current = next
    setLiveLayout(next)
  }

  updateDragAtRef.current = updateDragAt
  finishDragRef.current = finishDrag

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent): void => {
      if (dragRef.current?.pointerId !== event.pointerId) return
      event.preventDefault()
      updateDragAtRef.current(event.clientX, event.clientY)
    }
    const handlePointerEnd = (event: PointerEvent): void => {
      if (dragRef.current?.pointerId !== event.pointerId) return
      finishDragRef.current()
    }
    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerEnd)
    window.addEventListener('pointercancel', handlePointerEnd)
    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerEnd)
      window.removeEventListener('pointercancel', handlePointerEnd)
    }
  }, [])

  const updateDrag = (event: React.PointerEvent<HTMLElement>): void => {
    updateDragAt(event.clientX, event.clientY)
  }

  return <div ref={stageRef} className={`editing-caption-canvas-overlay editing-caption-canvas-overlay-${line} ${isDragging ? 'is-dragging' : ''}`} data-testid={`editing-caption-canvas-overlay-${line}`} data-line={line} aria-label={hint}>
    {isCentered ? <span className="editing-caption-canvas-guide" aria-hidden="true" /> : null}
    <div className="editing-caption-canvas-box" style={{ left: `${effectiveLayout.xPercent}%`, top: `${effectiveLayout.yPercent}%`, width: `${effectiveLayout.widthPercent}%`, '--editing-caption-box-height': `${Math.max(40, effectiveLayout.fontSizePx * 1.8)}px` } as CSSProperties}>
      <button className="editing-caption-canvas-body" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'move')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
      <button className="editing-caption-canvas-handle is-left" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'resize-left')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
      <button className="editing-caption-canvas-handle is-right" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'resize-right')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
    </div>
  </div>
}
