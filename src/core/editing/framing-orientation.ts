import type { EditingClipTreatment } from '../../shared/editing-types'

export type EditingFramingOrientation = 'portrait' | 'landscape'

/** Pireel's large-area framing rule: a narrow canvas gets a top/bottom vacancy, a wide canvas gets a side vacancy. */
export function getEditingFramingOrientation(width: number | undefined, height: number | undefined): EditingFramingOrientation {
  const safeWidth = Number.isFinite(width) && (width ?? 0) > 0 ? width as number : 1920
  const safeHeight = Number.isFinite(height) && (height ?? 0) > 0 ? height as number : 1080
  return safeWidth < safeHeight ? 'portrait' : 'landscape'
}

/** Fullscreen and punch-in work for either canvas. Only the large-area treatments are orientation-gated. */
export function isEditingFramingTreatmentAllowed(treatment: EditingClipTreatment, orientation: EditingFramingOrientation): boolean {
  if (treatment === 'full' || treatment === 'punch-in') return true
  const isCorner = treatment === 'corner-br' || treatment === 'corner-tl'
  const isSplit = treatment === 'split-left' || treatment === 'split-right'
  return orientation === 'portrait' ? isCorner : isSplit
}

export function isEditingFramingTreatmentRecommended(treatment: EditingClipTreatment, orientation: EditingFramingOrientation): boolean {
  return isEditingFramingTreatmentAllowed(treatment, orientation) && treatment !== 'full' && treatment !== 'punch-in'
}
