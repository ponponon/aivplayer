export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return '00:00'
  }

  const rounded = Math.floor(seconds)
  const hours = Math.floor(rounded / 3600)
  const minutes = Math.floor((rounded % 3600) / 60)
  const remainingSeconds = rounded % 60

  if (hours > 0) {
    return [hours, minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':')
  }

  return [minutes, remainingSeconds].map((part) => String(part).padStart(2, '0')).join(':')
}

export function formatPlaybackTimeLabel(currentTime: number, duration: number, showTotalTime: boolean): string {
  const safeCurrentTime = Number.isFinite(currentTime) && currentTime > 0 ? currentTime : 0
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0

  if (showTotalTime) {
    return formatTime(safeDuration)
  }

  const remainingTime = Math.max(0, safeDuration - safeCurrentTime)
  return remainingTime > 0 ? `-${formatTime(remainingTime)}` : '00:00'
}
