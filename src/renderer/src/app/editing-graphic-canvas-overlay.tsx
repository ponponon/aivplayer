import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { getEditingGraphicTransform, hasEditingGraphicTransform, updateEditingGraphicTransform, type EditingGraphicTransformDragMode } from '../../../core/editing/graphic-layout'
import type { EditingGraphic } from '../../../shared/editing-types'

type Props = {
  graphic: EditingGraphic
  hint: string
  onChange: (patch: Partial<Pick<EditingGraphic, 'xPercent' | 'yPercent' | 'widthPercent' | 'rotationDegrees'>>) => void
}

type CardRect = { xPercent: number; yPercent: number; widthPercent: number; heightPx: number }
type DragState = { mode: EditingGraphicTransformDragMode; pointerId: number; startX: number; startY: number; startAngle: number; centerX: number; centerY: number; base: ReturnType<typeof getEditingGraphicTransform>; width: number; height: number }

function findGraphicCard(stage: HTMLElement, graphicId: string): HTMLElement | null {
  return Array.from(stage.querySelectorAll<HTMLElement>('[data-editing-graphic-id]')).find((element) => element.dataset.editingGraphicId === graphicId) ?? null
}

function changed(before: ReturnType<typeof getEditingGraphicTransform>, after: ReturnType<typeof getEditingGraphicTransform>): boolean {
  return before.xPercent !== after.xPercent || before.yPercent !== after.yPercent || before.widthPercent !== after.widthPercent || before.rotationDegrees !== after.rotationDegrees
}

function normalizeAngle(delta: number): number {
  let result = delta
  while (result > 180) result -= 360
  while (result < -180) result += 360
  return result
}

export function EditingGraphicCanvasOverlay({ graphic, hint, onChange }: Props): React.ReactElement | null {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const liveTransformRef = useRef<ReturnType<typeof getEditingGraphicTransform> | null>(null)
  const onChangeRef = useRef(onChange)
  const updateDragAtRef = useRef<(clientX: number, clientY: number) => void>(() => {})
  const finishDragRef = useRef<() => void>(() => {})
  const [cardRect, setCardRect] = useState<CardRect | null>(null)
  const [liveTransform, setLiveTransform] = useState<ReturnType<typeof getEditingGraphicTransform> | null>(null)
  onChangeRef.current = onChange

  useEffect(() => {
    const measure = (): void => {
      const stage = stageRef.current?.parentElement
      const card = stage ? findGraphicCard(stage, graphic.id) : null
      if (!stage || !card) return
      const stageBounds = stage.getBoundingClientRect()
      const cardBounds = card.getBoundingClientRect()
      if (stageBounds.width <= 0 || stageBounds.height <= 0 || cardBounds.width <= 0 || cardBounds.height <= 0) return
      const next = { xPercent: ((cardBounds.left + cardBounds.width / 2 - stageBounds.left) / stageBounds.width) * 100, yPercent: ((cardBounds.top + cardBounds.height / 2 - stageBounds.top) / stageBounds.height) * 100, widthPercent: (cardBounds.width / stageBounds.width) * 100, heightPx: cardBounds.height }
      setCardRect((previous) => previous && Math.abs(previous.xPercent - next.xPercent) < 0.01 && Math.abs(previous.yPercent - next.yPercent) < 0.01 && Math.abs(previous.widthPercent - next.widthPercent) < 0.01 && Math.abs(previous.heightPx - next.heightPx) < 0.5 ? previous : next)
    }
    const frame = window.requestAnimationFrame(measure)
    const stage = stageRef.current?.parentElement
    const card = stage ? findGraphicCard(stage, graphic.id) : null
    const observer = typeof ResizeObserver === 'undefined' || !card ? null : new ResizeObserver(measure)
    if (observer && card) observer.observe(card)
    return () => { window.cancelAnimationFrame(frame); observer?.disconnect() }
  }, [graphic.id, graphic.text, graphic.style, graphic.position, graphic.xPercent, graphic.yPercent, graphic.widthPercent, graphic.rotationDegrees])

  const baseTransform = hasEditingGraphicTransform(graphic) ? getEditingGraphicTransform(graphic) : cardRect ? getEditingGraphicTransform({ ...graphic, ...cardRect }) : null
  const effectiveTransform = liveTransform ?? baseTransform
  const isDragging = liveTransform !== null
  const boxHeight = Math.max(42, cardRect?.heightPx ?? 64)

  const finishDrag = (): void => {
    const drag = dragRef.current
    if (!drag) return
    const finalTransform = liveTransformRef.current ?? drag.base
    dragRef.current = null
    liveTransformRef.current = null
    setLiveTransform(null)
    if (changed(drag.base, finalTransform)) onChangeRef.current({ xPercent: finalTransform.xPercent, yPercent: finalTransform.yPercent, widthPercent: finalTransform.widthPercent, rotationDegrees: finalTransform.rotationDegrees })
  }

  const beginDrag = (event: React.PointerEvent<HTMLElement>, mode: EditingGraphicTransformDragMode): void => {
    event.preventDefault()
    event.stopPropagation()
    const stage = stageRef.current?.parentElement
    const base = baseTransform
    if (!stage || !base) return
    const bounds = stage.getBoundingClientRect()
    if (bounds.width <= 0 || bounds.height <= 0) return
    const centerX = bounds.left + (base.xPercent / 100) * bounds.width
    const centerY = bounds.top + (base.yPercent / 100) * bounds.height
    const startAngle = Math.atan2(event.clientY - centerY, event.clientX - centerX)
    const next = { mode, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, startAngle, centerX, centerY, base, width: bounds.width, height: bounds.height }
    dragRef.current = next
    liveTransformRef.current = base
    setLiveTransform(base)
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* window listeners remain the fallback */ }
  }

  const updateDragAt = (clientX: number, clientY: number): void => {
    const drag = dragRef.current
    if (!drag) return
    const next = drag.mode === 'rotate'
      ? updateEditingGraphicTransform({ ...graphic, ...drag.base }, 'rotate', (normalizeAngle(Math.atan2(clientY - drag.centerY, clientX - drag.centerX) - drag.startAngle) * 180) / Math.PI)
      : updateEditingGraphicTransform({ ...graphic, ...drag.base }, drag.mode, ((clientX - drag.startX) / drag.width) * 100, ((clientY - drag.startY) / drag.height) * 100)
    liveTransformRef.current = next
    setLiveTransform(next)
  }
  updateDragAtRef.current = updateDragAt
  finishDragRef.current = finishDrag

  useEffect(() => {
    const move = (event: PointerEvent): void => { if (dragRef.current?.pointerId === event.pointerId) { event.preventDefault(); updateDragAtRef.current(event.clientX, event.clientY) } }
    const end = (event: PointerEvent): void => { if (dragRef.current?.pointerId === event.pointerId) finishDragRef.current() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    return () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end); window.removeEventListener('pointercancel', end) }
  }, [])

  const updateDrag = (event: React.PointerEvent<HTMLElement>): void => updateDragAt(event.clientX, event.clientY)
  const isCentered = isDragging && effectiveTransform !== null && Math.abs(effectiveTransform.xPercent - 50) < 0.01
  return <div ref={stageRef} className={`editing-graphic-canvas-overlay ${isDragging ? 'is-dragging' : ''}`} data-testid="editing-graphic-canvas-overlay" aria-label={hint}>
    {effectiveTransform ? <>
      {isCentered ? <span className="editing-graphic-canvas-guide" aria-hidden="true" /> : null}
      <div className="editing-graphic-canvas-box" style={{ left: `${effectiveTransform.xPercent}%`, top: `${effectiveTransform.yPercent}%`, width: `${effectiveTransform.widthPercent}%`, '--editing-graphic-box-height': `${boxHeight}px`, transform: `translate(-50%, -50%) rotate(${effectiveTransform.rotationDegrees}deg)` } as CSSProperties}>
        <button className="editing-graphic-canvas-body" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'move')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
        <button className="editing-graphic-canvas-handle is-left" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'resize-left')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
        <button className="editing-graphic-canvas-handle is-right" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'resize-right')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag} />
        <button className="editing-graphic-canvas-rotate" type="button" aria-label={hint} onPointerDown={(event) => beginDrag(event, 'rotate')} onPointerMove={updateDrag} onPointerUp={finishDrag} onPointerCancel={finishDrag}>↻</button>
      </div>
    </> : null}
  </div>
}
