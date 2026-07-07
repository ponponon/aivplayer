const PLAYBACK_END_RESUME_EPSILON_SECONDS = 0.5

export function resolvePlaybackStartTime(savedTime: number, duration: number | null | undefined): number {
  const safeSavedTime = Number.isFinite(savedTime) && savedTime > 0 ? savedTime : 0
  const safeDuration = typeof duration === 'number' && Number.isFinite(duration) && duration > 0 ? duration : 0

  if (safeDuration === 0) {
    return safeSavedTime
  }

  if (safeSavedTime >= Math.max(0, safeDuration - PLAYBACK_END_RESUME_EPSILON_SECONDS)) {
    return 0
  }

  return safeSavedTime
}
