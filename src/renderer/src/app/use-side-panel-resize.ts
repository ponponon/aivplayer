import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import {
  normalizeSidePanelWidth,
  SIDE_PANEL_WIDTH_DEFAULT,
  SIDE_PANEL_WIDTH_MAX,
  SIDE_PANEL_WIDTH_MIN
} from '../../../shared/app-settings'

type SidePanelDragState = {
  pointerId: number
  startX: number
  startWidth: number
  currentWidth: number
}

export function useSidePanelResize(initialWidth: number, onCommit: (width: number) => void) {
  const normalizedInitialWidth = normalizeSidePanelWidth(initialWidth, SIDE_PANEL_WIDTH_DEFAULT)
  const [width, setWidth] = useState(normalizedInitialWidth)
  const [isDragging, setIsDragging] = useState(false)
  const widthRef = useRef(normalizedInitialWidth)
  const dragRef = useRef<SidePanelDragState | null>(null)

  useEffect(() => {
    if (dragRef.current) return
    const nextWidth = normalizeSidePanelWidth(initialWidth, SIDE_PANEL_WIDTH_DEFAULT)
    widthRef.current = nextWidth
    setWidth(nextWidth)
  }, [initialWidth])

  const updateWidth = useCallback((nextWidth: number): number => {
    const normalizedWidth = normalizeSidePanelWidth(nextWidth, SIDE_PANEL_WIDTH_DEFAULT)
    widthRef.current = normalizedWidth
    setWidth(normalizedWidth)
    return normalizedWidth
  }, [])

  const beginResize = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault()
    event.stopPropagation()
    event.currentTarget.setPointerCapture(event.pointerId)
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: widthRef.current,
      currentWidth: widthRef.current
    }
    setIsDragging(true)
  }, [])

  const moveResize = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const active = dragRef.current
    if (!active || active.pointerId !== event.pointerId) return

    event.preventDefault()
    const nextWidth = updateWidth(active.startWidth + active.startX - event.clientX)
    active.currentWidth = nextWidth
  }, [updateWidth])

  const finishResize = useCallback((event: PointerEvent<HTMLDivElement>): void => {
    const active = dragRef.current
    if (!active || active.pointerId !== event.pointerId) return

    event.preventDefault()
    dragRef.current = null
    setIsDragging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    if (active.currentWidth !== active.startWidth) onCommit(active.currentWidth)
  }, [onCommit])

  const adjustWithKeyboard = useCallback((event: KeyboardEvent<HTMLDivElement>): void => {
    const delta = event.shiftKey ? 32 : 16
    let nextWidth: number | null = null

    if (event.key === 'ArrowLeft') nextWidth = widthRef.current + delta
    if (event.key === 'ArrowRight') nextWidth = widthRef.current - delta
    if (event.key === 'Home') nextWidth = SIDE_PANEL_WIDTH_MIN
    if (event.key === 'End') nextWidth = SIDE_PANEL_WIDTH_MAX
    if (nextWidth === null) return

    event.preventDefault()
    const previousWidth = widthRef.current
    const normalizedWidth = updateWidth(nextWidth)
    if (normalizedWidth !== previousWidth) onCommit(normalizedWidth)
  }, [onCommit, updateWidth])

  return {
    width,
    isDragging,
    beginResize,
    moveResize,
    finishResize,
    adjustWithKeyboard,
    minWidth: SIDE_PANEL_WIDTH_MIN,
    maxWidth: SIDE_PANEL_WIDTH_MAX
  }
}
