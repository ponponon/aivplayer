import type { EditingCaptionLayout, EditingCaptionLayoutPatch, EditingCaptionLineLayout } from '../../shared/editing-types'

export const DEFAULT_EDITING_CAPTION_LAYOUT: EditingCaptionLayout = {
  xPercent: 50,
  yPercent: 82,
  widthPercent: 82,
  fontSizePx: 48
}

export const DEFAULT_EDITING_TRANSLATION_CAPTION_LAYOUT: EditingCaptionLineLayout = {
  xPercent: 50,
  yPercent: 90,
  widthPercent: 82,
  fontSizePx: 36
}

export const EDITING_CAPTION_LAYOUT_LIMITS = {
  xPercent: { min: 10, max: 90 },
  yPercent: { min: 10, max: 92 },
  widthPercent: { min: 30, max: 100 },
  fontSizePx: { min: 24, max: 96 }
} as const

export type EditingCaptionLayoutDragMode = 'move' | 'resize-left' | 'resize-right'
export type EditingCaptionLine = 'source' | 'translation'

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function inRange(value: unknown, range: { min: number; max: number }): value is number {
  return isFiniteNumber(value) && value >= range.min && value <= range.max
}

export function isEditingCaptionLayout(value: unknown): value is EditingCaptionLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const layout = value as Partial<EditingCaptionLayout>
  const translation = (value as { translation?: unknown }).translation
  return isEditingCaptionLineLayout(layout) && (translation === undefined || isEditingCaptionLineLayout(translation))
}

function isEditingCaptionLineLayout(value: unknown): value is EditingCaptionLineLayout {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const layout = value as Partial<EditingCaptionLineLayout>
  return inRange(layout.xPercent, EDITING_CAPTION_LAYOUT_LIMITS.xPercent) && inRange(layout.yPercent, EDITING_CAPTION_LAYOUT_LIMITS.yPercent) && inRange(layout.widthPercent, EDITING_CAPTION_LAYOUT_LIMITS.widthPercent) && inRange(layout.fontSizePx, EDITING_CAPTION_LAYOUT_LIMITS.fontSizePx)
}

function normalizeLine(value: Partial<EditingCaptionLineLayout> | null | undefined, fallback: EditingCaptionLineLayout): EditingCaptionLineLayout {
  const next = { ...fallback, ...(value ?? {}) }
  return {
    xPercent: Math.min(EDITING_CAPTION_LAYOUT_LIMITS.xPercent.max, Math.max(EDITING_CAPTION_LAYOUT_LIMITS.xPercent.min, Number.isFinite(next.xPercent) ? next.xPercent : fallback.xPercent)),
    yPercent: Math.min(EDITING_CAPTION_LAYOUT_LIMITS.yPercent.max, Math.max(EDITING_CAPTION_LAYOUT_LIMITS.yPercent.min, Number.isFinite(next.yPercent) ? next.yPercent : fallback.yPercent)),
    widthPercent: Math.min(EDITING_CAPTION_LAYOUT_LIMITS.widthPercent.max, Math.max(EDITING_CAPTION_LAYOUT_LIMITS.widthPercent.min, Number.isFinite(next.widthPercent) ? next.widthPercent : fallback.widthPercent)),
    fontSizePx: Math.round(Math.min(EDITING_CAPTION_LAYOUT_LIMITS.fontSizePx.max, Math.max(EDITING_CAPTION_LAYOUT_LIMITS.fontSizePx.min, Number.isFinite(next.fontSizePx) ? next.fontSizePx : fallback.fontSizePx)))
  }
}

export function getEditingCaptionLayout(value: EditingCaptionLayoutPatch | null | undefined): EditingCaptionLayout {
  const next = { ...DEFAULT_EDITING_CAPTION_LAYOUT, ...(value ?? {}) }
  const source = normalizeLine(next, DEFAULT_EDITING_CAPTION_LAYOUT)
  return next.translation === null || next.translation === undefined
    ? source
    : { ...source, translation: normalizeLine(next.translation, getEditingCaptionLineLayout(source, 'translation')) }
}

export function getEditingCaptionLineLayout(value: EditingCaptionLayout | Partial<EditingCaptionLayout> | null | undefined, line: EditingCaptionLine): EditingCaptionLineLayout {
  const layout = getEditingCaptionLayout(value)
  if (line === 'source') return layout
  const fallback = {
    xPercent: layout.xPercent,
    yPercent: Math.min(EDITING_CAPTION_LAYOUT_LIMITS.yPercent.max, layout.yPercent + 8),
    widthPercent: layout.widthPercent,
    fontSizePx: Math.max(EDITING_CAPTION_LAYOUT_LIMITS.fontSizePx.min, Math.round(layout.fontSizePx * 0.75))
  }
  return layout.translation ? normalizeLine(layout.translation, fallback) : fallback
}

export function updateEditingCaptionLineLayout(
  value: EditingCaptionLayout | Partial<EditingCaptionLayout> | null | undefined,
  line: EditingCaptionLine,
  patch: Partial<EditingCaptionLineLayout>
): EditingCaptionLayout {
  const layout = getEditingCaptionLayout(value)
  if (line === 'source') return getEditingCaptionLayout({ ...layout, ...patch })
  return getEditingCaptionLayout({ ...layout, translation: { ...getEditingCaptionLineLayout(layout, 'translation'), ...patch } })
}

/** Applies a normalized canvas drag to the caption layout without mutating the project. */
export function updateEditingCaptionLayout(
  value: Partial<EditingCaptionLineLayout> | null | undefined,
  mode: EditingCaptionLayoutDragMode,
  deltaXPercent: number,
  deltaYPercent = 0
): EditingCaptionLineLayout {
  const current = getEditingCaptionLayout(value)
  const safeDeltaX = Number.isFinite(deltaXPercent) ? deltaXPercent : 0
  const safeDeltaY = Number.isFinite(deltaYPercent) ? deltaYPercent : 0

  if (mode === 'move') {
    let xPercent = current.xPercent + safeDeltaX
    if (Math.abs(xPercent - 50) <= 1.5) xPercent = 50
    return getEditingCaptionLayout({
      ...current,
      xPercent,
      yPercent: current.yPercent + safeDeltaY
    })
  }

  const minimumWidth = EDITING_CAPTION_LAYOUT_LIMITS.widthPercent.min
  const currentLeft = current.xPercent - current.widthPercent / 2
  const currentRight = current.xPercent + current.widthPercent / 2
  const nextLeft = mode === 'resize-left'
    ? Math.min(currentRight - minimumWidth, Math.max(0, currentLeft + safeDeltaX))
    : currentLeft
  const nextRight = mode === 'resize-right'
    ? Math.max(currentLeft + minimumWidth, Math.min(100, currentRight + safeDeltaX))
    : currentRight

  return getEditingCaptionLayout({
    ...current,
    xPercent: (nextLeft + nextRight) / 2,
    widthPercent: nextRight - nextLeft
  })
}
