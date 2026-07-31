import type { EditingOverlayTrackKind, EditingProject } from '../../shared/editing-types'

export const DEFAULT_EDITING_OVERLAY_TRACK_ORDER: readonly EditingOverlayTrackKind[] = ['videoBlocks', 'graphics', 'captions']

/** Returns a complete, duplicate-free back-to-front overlay order for old projects too. */
export function getEditingOverlayTrackOrder(order?: readonly EditingOverlayTrackKind[]): EditingOverlayTrackKind[] {
  const next: EditingOverlayTrackKind[] = []
  for (const kind of order ?? []) if (!next.includes(kind)) next.push(kind)
  for (const kind of DEFAULT_EDITING_OVERLAY_TRACK_ORDER) if (!next.includes(kind)) next.push(kind)
  return next
}

/** Moves one overlay track before the target track and keeps the change undoable by the caller. */
export function reorderEditingOverlayTracks(project: EditingProject, source: EditingOverlayTrackKind, target: EditingOverlayTrackKind): EditingProject {
  if (source === target) return project
  const order = getEditingOverlayTrackOrder(project.overlayTrackOrder)
  const sourceIndex = order.indexOf(source)
  if (sourceIndex < 0 || !order.includes(target)) return project
  const next = [...order]
  next.splice(sourceIndex, 1)
  const targetIndex = next.indexOf(target)
  if (targetIndex < 0) return project
  next.splice(targetIndex, 0, source)
  return { ...project, overlayTrackOrder: next, updatedAt: Date.now() }
}
