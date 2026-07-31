import type { EditingOverlayTrackKind } from '../../../shared/editing-types'
import type { DragEvent } from 'react'

export const EDITING_OVERLAY_TRACK_DRAG_TYPE = 'application/x-aivplayer-overlay-track'

export function writeEditingOverlayTrackDrag(event: DragEvent<HTMLElement>, kind: EditingOverlayTrackKind): void {
  event.dataTransfer.setData(EDITING_OVERLAY_TRACK_DRAG_TYPE, kind)
  event.dataTransfer.effectAllowed = 'move'
}

export function readEditingOverlayTrackDrag(event: DragEvent<HTMLElement>): EditingOverlayTrackKind | null {
  const value = event.dataTransfer.getData(EDITING_OVERLAY_TRACK_DRAG_TYPE)
  return value === 'videoBlocks' || value === 'graphics' || value === 'captions' ? value : null
}
