import type { EditingGraphicMotion, EditingVideoClip } from '../../shared/editing-types'

export const EDITING_CLIP_MOTION_MIN_DURATION = 0.1
export const EDITING_CLIP_MOTION_MAX_DURATION = 1
export const EDITING_CLIP_MOTION_DEFAULT_DURATION = 0.35
export const EDITING_CLIP_MOTIONS: readonly EditingGraphicMotion[] = ['none', 'fade', 'slide-left', 'slide-right', 'rise', 'scale']

export type EditingClipMotion = { enterMotion: EditingGraphicMotion; exitMotion: EditingGraphicMotion; durationSeconds: number }

export function clampEditingClipMotionDuration(value: number): number {
  return Math.min(EDITING_CLIP_MOTION_MAX_DURATION, Math.max(EDITING_CLIP_MOTION_MIN_DURATION, Number.isFinite(value) ? value : EDITING_CLIP_MOTION_DEFAULT_DURATION))
}

export function getEditingClipMotion(clip: Pick<EditingVideoClip, 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>): EditingClipMotion {
  return { enterMotion: clip.enterMotion ?? 'none', exitMotion: clip.exitMotion ?? 'none', durationSeconds: clampEditingClipMotionDuration(clip.motionDurationSeconds ?? EDITING_CLIP_MOTION_DEFAULT_DURATION) }
}

export function getEditingClipMotionPhase(clip: EditingVideoClip, currentTime: number): { motion: EditingGraphicMotion; phase: 'enter' | 'exit'; progress: number } | null {
  const motion = getEditingClipMotion(clip)
  const clipDuration = Math.max(0, clip.sourceEndSeconds - clip.sourceStartSeconds)
  const duration = Math.min(motion.durationSeconds, clipDuration / 2)
  if (duration <= 0) return null
  if (motion.enterMotion !== 'none' && currentTime >= 0 && currentTime < duration) return { motion: motion.enterMotion, phase: 'enter', progress: Math.min(1, Math.max(0, currentTime / duration)) }
  const exitStart = Math.max(0, clipDuration - duration)
  if (motion.exitMotion !== 'none' && currentTime >= exitStart && currentTime < clipDuration) return { motion: motion.exitMotion, phase: 'exit', progress: Math.min(1, Math.max(0, (currentTime - exitStart) / duration)) }
  return null
}

export type EditingClipMotionStyle = { opacity: number; translateXPercent: number; translateYPercent: number; scale: number }

export function getEditingClipMotionStyle(clip: EditingVideoClip, currentTime: number): EditingClipMotionStyle {
  const phase = getEditingClipMotionPhase(clip, currentTime)
  if (!phase) return { opacity: 1, translateXPercent: 0, translateYPercent: 0, scale: 1 }
  const distance = phase.phase === 'enter' ? 1 - phase.progress : phase.progress
  return {
    opacity: phase.motion === 'fade' ? (phase.phase === 'enter' ? phase.progress : 1 - phase.progress) : 1,
    translateXPercent: phase.motion === 'slide-left' ? -100 * distance : phase.motion === 'slide-right' ? 100 * distance : 0,
    translateYPercent: phase.motion === 'rise' ? (phase.phase === 'enter' ? 100 : -100) * distance : 0,
    scale: phase.motion === 'scale' ? (phase.phase === 'enter' ? 0.82 + 0.18 * phase.progress : 1 - 0.18 * phase.progress) : 1
  }
}

export function updateEditingClipMotion(clips: readonly EditingVideoClip[], clipId: string, patch: Partial<Pick<EditingVideoClip, 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>): EditingVideoClip[] {
  return clips.map((clip) => clip.id !== clipId ? clip : {
    ...clip,
    ...(patch.enterMotion === undefined ? {} : { enterMotion: patch.enterMotion }),
    ...(patch.exitMotion === undefined ? {} : { exitMotion: patch.exitMotion }),
    ...(patch.motionDurationSeconds === undefined ? {} : { motionDurationSeconds: clampEditingClipMotionDuration(patch.motionDurationSeconds) })
  })
}
