import { MIN_CLIP_DURATION_SECONDS } from '../../../shared/clip-export'
import { formatTime } from '../lib/time'

export type ClipSelection = {
  startSeconds: number
  endSeconds: number
}

export function roundClipTime(value: number): number {
  if (!Number.isFinite(value)) {
    return 0
  }

  return Math.round(Math.max(0, value) * 10) / 10
}

export function formatClipTime(value: number): string {
  const rounded = roundClipTime(value)
  if (Number.isInteger(rounded)) {
    return formatTime(rounded)
  }

  const tenths = Math.round((rounded - Math.floor(rounded)) * 10)
  return `${formatTime(Math.floor(rounded))}.${tenths}`
}

export function normalizeClipSelection(startSeconds: number, endSeconds: number, durationSeconds: number): ClipSelection {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0

  if (safeDuration === 0) {
    return { startSeconds: 0, endSeconds: 0 }
  }

  const minimumDuration = Math.min(MIN_CLIP_DURATION_SECONDS, safeDuration)
  const safeStart = roundClipTime(startSeconds)
  const safeEnd = roundClipTime(endSeconds)
  const start = Math.min(Math.max(0, safeStart), Math.max(0, safeDuration - minimumDuration))
  const end = Math.min(Math.max(start + minimumDuration, safeEnd), safeDuration)

  return {
    startSeconds: start,
    endSeconds: end
  }
}
