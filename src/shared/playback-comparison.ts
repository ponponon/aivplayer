function finitePositive(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null
}

export function getComparisonDuration(primaryDuration: number, secondaryDuration: number): number {
  const durations = [finitePositive(primaryDuration), finitePositive(secondaryDuration)].filter((value): value is number => value !== null)
  return durations.length > 0 ? Math.min(...durations) : 0
}

export function clampComparisonTime(currentTime: number, primaryDuration: number, secondaryDuration: number): number {
  const safeTime = Number.isFinite(currentTime) ? Math.max(0, currentTime) : 0
  const duration = getComparisonDuration(primaryDuration, secondaryDuration)
  return duration > 0 ? Math.min(safeTime, duration) : safeTime
}
