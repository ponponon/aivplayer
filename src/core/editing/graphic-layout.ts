import type { EditingGraphic, EditingGraphicPosition } from '../../shared/editing-types'

export const EDITING_GRAPHIC_MIN_X_PERCENT = 4
export const EDITING_GRAPHIC_MAX_X_PERCENT = 96
export const EDITING_GRAPHIC_MIN_Y_PERCENT = 4
export const EDITING_GRAPHIC_MAX_Y_PERCENT = 96
export const EDITING_GRAPHIC_MIN_WIDTH_PERCENT = 16
export const EDITING_GRAPHIC_MAX_WIDTH_PERCENT = 86
export const EDITING_GRAPHIC_MIN_ROTATION_DEGREES = -180
export const EDITING_GRAPHIC_MAX_ROTATION_DEGREES = 180

export type EditingGraphicTransform = {
  xPercent: number
  yPercent: number
  widthPercent: number
  rotationDegrees: number
}

export type EditingGraphicTransformDragMode = 'move' | 'resize-left' | 'resize-right' | 'rotate'

const PRESET_TRANSFORMS: Record<EditingGraphicPosition, Pick<EditingGraphicTransform, 'xPercent' | 'yPercent'>> = {
  center: { xPercent: 50, yPercent: 50 },
  'top-left': { xPercent: 25, yPercent: 22 },
  'top-right': { xPercent: 75, yPercent: 22 },
  'bottom-left': { xPercent: 25, yPercent: 78 },
  'bottom-right': { xPercent: 75, yPercent: 78 }
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Number.isFinite(value) ? value : minimum))
}

export function hasEditingGraphicTransform(graphic: Pick<EditingGraphic, 'xPercent' | 'yPercent' | 'widthPercent' | 'rotationDegrees'>): boolean {
  return graphic.xPercent !== undefined || graphic.yPercent !== undefined || graphic.widthPercent !== undefined || graphic.rotationDegrees !== undefined
}

export function getEditingGraphicTransform(graphic: Pick<EditingGraphic, 'position' | 'xPercent' | 'yPercent' | 'widthPercent' | 'rotationDegrees'>): EditingGraphicTransform {
  const preset = PRESET_TRANSFORMS[graphic.position]
  return {
    xPercent: clamp(graphic.xPercent ?? preset.xPercent, EDITING_GRAPHIC_MIN_X_PERCENT, EDITING_GRAPHIC_MAX_X_PERCENT),
    yPercent: clamp(graphic.yPercent ?? preset.yPercent, EDITING_GRAPHIC_MIN_Y_PERCENT, EDITING_GRAPHIC_MAX_Y_PERCENT),
    widthPercent: clamp(graphic.widthPercent ?? 58, EDITING_GRAPHIC_MIN_WIDTH_PERCENT, EDITING_GRAPHIC_MAX_WIDTH_PERCENT),
    rotationDegrees: clamp(graphic.rotationDegrees ?? 0, EDITING_GRAPHIC_MIN_ROTATION_DEGREES, EDITING_GRAPHIC_MAX_ROTATION_DEGREES)
  }
}

export function updateEditingGraphicTransform(value: Pick<EditingGraphic, 'position' | 'xPercent' | 'yPercent' | 'widthPercent' | 'rotationDegrees'>, mode: EditingGraphicTransformDragMode, deltaXPercent: number, deltaYPercent = 0): EditingGraphicTransform {
  const base = getEditingGraphicTransform(value)
  const dx = Number.isFinite(deltaXPercent) ? deltaXPercent : 0
  const dy = Number.isFinite(deltaYPercent) ? deltaYPercent : 0
  if (mode === 'move') return { ...base, xPercent: clamp(base.xPercent + dx, EDITING_GRAPHIC_MIN_X_PERCENT, EDITING_GRAPHIC_MAX_X_PERCENT), yPercent: clamp(base.yPercent + dy, EDITING_GRAPHIC_MIN_Y_PERCENT, EDITING_GRAPHIC_MAX_Y_PERCENT) }
  if (mode === 'rotate') return { ...base, rotationDegrees: clamp(base.rotationDegrees + dx, EDITING_GRAPHIC_MIN_ROTATION_DEGREES, EDITING_GRAPHIC_MAX_ROTATION_DEGREES) }
  const left = base.xPercent - base.widthPercent / 2
  const right = base.xPercent + base.widthPercent / 2
  if (mode === 'resize-left') {
    const nextLeft = clamp(left + dx, EDITING_GRAPHIC_MIN_X_PERCENT, right - EDITING_GRAPHIC_MIN_WIDTH_PERCENT)
    return { ...base, xPercent: (nextLeft + right) / 2, widthPercent: right - nextLeft }
  }
  const nextRight = clamp(right + dx, left + EDITING_GRAPHIC_MIN_WIDTH_PERCENT, EDITING_GRAPHIC_MAX_X_PERCENT)
  return { ...base, xPercent: (left + nextRight) / 2, widthPercent: nextRight - left }
}
