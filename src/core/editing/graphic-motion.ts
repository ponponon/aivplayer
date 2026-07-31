import type { EditingGraphic, EditingGraphicMotion } from '../../shared/editing-types'

export const EDITING_GRAPHIC_MOTION_MIN_DURATION = 0.1
export const EDITING_GRAPHIC_MOTION_MAX_DURATION = 1
export const EDITING_GRAPHIC_MOTION_DEFAULT_DURATION = 0.35
export const EDITING_GRAPHIC_MOTIONS: readonly EditingGraphicMotion[] = ['none', 'fade', 'slide-left', 'slide-right', 'rise', 'scale']

export function clampEditingGraphicMotionDuration(value: number): number {
  return Math.min(EDITING_GRAPHIC_MOTION_MAX_DURATION, Math.max(EDITING_GRAPHIC_MOTION_MIN_DURATION, Number.isFinite(value) ? value : EDITING_GRAPHIC_MOTION_DEFAULT_DURATION))
}

export function getEditingGraphicMotion(graphic: Pick<EditingGraphic, 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>): { enterMotion: EditingGraphicMotion; exitMotion: EditingGraphicMotion; durationSeconds: number } {
  return { enterMotion: graphic.enterMotion ?? 'none', exitMotion: graphic.exitMotion ?? 'none', durationSeconds: clampEditingGraphicMotionDuration(graphic.motionDurationSeconds ?? EDITING_GRAPHIC_MOTION_DEFAULT_DURATION) }
}

export function getEditingGraphicMotionPhase(graphic: EditingGraphic, currentTime: number): { motion: EditingGraphicMotion; phase: 'enter' | 'exit'; progress: number } | null {
  const motion = getEditingGraphicMotion(graphic)
  if (motion.enterMotion !== 'none' && currentTime >= graphic.startSeconds && currentTime < graphic.startSeconds + motion.durationSeconds) return { motion: motion.enterMotion, phase: 'enter', progress: Math.min(1, Math.max(0, (currentTime - graphic.startSeconds) / motion.durationSeconds)) }
  const endSeconds = graphic.startSeconds + graphic.durationSeconds
  if (motion.exitMotion !== 'none' && currentTime >= endSeconds && currentTime < endSeconds + motion.durationSeconds) return { motion: motion.exitMotion, phase: 'exit', progress: Math.min(1, Math.max(0, (currentTime - endSeconds) / motion.durationSeconds)) }
  return null
}

export function isEditingGraphicVisible(graphic: EditingGraphic, currentTime: number): boolean {
  const endSeconds = graphic.startSeconds + graphic.durationSeconds
  const motion = getEditingGraphicMotion(graphic)
  return (currentTime >= graphic.startSeconds && currentTime < endSeconds) || (motion.exitMotion !== 'none' && currentTime >= endSeconds && currentTime < endSeconds + motion.durationSeconds)
}

export type EditingGraphicMotionStyle = { opacity: number; translateXPercent: number; translateYPercent: number; scale: number }

export function getEditingGraphicMotionStyle(graphic: EditingGraphic, currentTime: number): EditingGraphicMotionStyle {
  const phase = getEditingGraphicMotionPhase(graphic, currentTime)
  if (!phase) return { opacity: 1, translateXPercent: 0, translateYPercent: 0, scale: 1 }
  const distance = phase.phase === 'enter' ? 1 - phase.progress : phase.progress
  return {
    opacity: phase.motion === 'fade' ? (phase.phase === 'enter' ? phase.progress : 1 - phase.progress) : 1,
    translateXPercent: phase.motion === 'slide-left' ? -100 * distance : phase.motion === 'slide-right' ? 100 * distance : 0,
    translateYPercent: phase.motion === 'rise' ? (phase.phase === 'enter' ? 100 : -100) * distance : 0,
    scale: phase.motion === 'scale' ? (phase.phase === 'enter' ? 0.82 + 0.18 * phase.progress : 1 - 0.18 * phase.progress) : 1
  }
}
