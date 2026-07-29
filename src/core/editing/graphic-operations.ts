import type { EditingGraphic, EditingGraphicPosition, EditingGraphicStyle } from '../../shared/editing-types'

export const EDITING_GRAPHIC_DEFAULT_DURATION = 3
export const EDITING_GRAPHIC_MIN_DURATION = 0.2

function createGraphicId(): string {
  return `graphic-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function clampDuration(durationSeconds: number, startSeconds: number, timelineDuration: number): number {
  return Math.max(EDITING_GRAPHIC_MIN_DURATION, Math.min(Math.max(EDITING_GRAPHIC_MIN_DURATION, timelineDuration - startSeconds), Number.isFinite(durationSeconds) ? durationSeconds : EDITING_GRAPHIC_DEFAULT_DURATION))
}

export function createEditingGraphic(text: string, startSeconds: number, timelineDuration: number, options: { position?: EditingGraphicPosition; style?: EditingGraphicStyle; durationSeconds?: number; id?: string } = {}): EditingGraphic | null {
  const normalizedText = text.trim()
  const safeTimelineDuration = Math.max(0, Number.isFinite(timelineDuration) ? timelineDuration : 0)
  const safeStart = Math.min(Math.max(0, Number.isFinite(startSeconds) ? startSeconds : 0), Math.max(0, safeTimelineDuration - EDITING_GRAPHIC_MIN_DURATION))
  if (!normalizedText || safeTimelineDuration - safeStart < EDITING_GRAPHIC_MIN_DURATION) return null
  return {
    id: options.id ?? createGraphicId(),
    startSeconds: safeStart,
    durationSeconds: clampDuration(options.durationSeconds ?? EDITING_GRAPHIC_DEFAULT_DURATION, safeStart, safeTimelineDuration),
    text: normalizedText,
    position: options.position ?? 'center',
    style: options.style ?? 'title'
  }
}

export function updateEditingGraphic(graphics: readonly EditingGraphic[], graphicId: string, patch: Partial<Pick<EditingGraphic, 'text' | 'position' | 'style' | 'startSeconds' | 'durationSeconds'>>, timelineDuration: number): EditingGraphic[] {
  return graphics.map((graphic) => {
    if (graphic.id !== graphicId) return graphic
    const startSeconds = Math.min(Math.max(0, Number.isFinite(patch.startSeconds ?? graphic.startSeconds) ? patch.startSeconds ?? graphic.startSeconds : graphic.startSeconds), Math.max(0, timelineDuration - EDITING_GRAPHIC_MIN_DURATION))
    return {
      ...graphic,
      ...(patch.text === undefined ? {} : { text: patch.text.trim() }),
      ...(patch.position === undefined ? {} : { position: patch.position }),
      ...(patch.style === undefined ? {} : { style: patch.style }),
      startSeconds,
      durationSeconds: clampDuration(patch.durationSeconds ?? graphic.durationSeconds, startSeconds, timelineDuration)
    }
  })
}

export function removeEditingGraphic(graphics: readonly EditingGraphic[], graphicId: string): EditingGraphic[] {
  return graphics.filter((graphic) => graphic.id !== graphicId)
}

export function findActiveEditingGraphics(graphics: readonly EditingGraphic[], currentTime: number): EditingGraphic[] {
  return graphics.filter((graphic) => currentTime >= graphic.startSeconds && currentTime < graphic.startSeconds + graphic.durationSeconds).sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
}
