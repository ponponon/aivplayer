const DEFAULT_RULER_WIDTH_PX = 960
const MIN_RULER_LABEL_SPACING_PX = 64

function niceRulerInterval(rawIntervalSeconds: number): number {
  const safeInterval = Math.max(1, rawIntervalSeconds)
  const magnitude = 10 ** Math.floor(Math.log10(safeInterval))
  const normalized = safeInterval / magnitude
  const niceNormalized = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return niceNormalized * magnitude
}

export function getEditingRulerIntervalSeconds(durationSeconds: number, availableWidthPx: number): number {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0
  if (safeDuration <= 0) return 1

  const safeWidth = Number.isFinite(availableWidthPx) && availableWidthPx > 0 ? availableWidthPx : DEFAULT_RULER_WIDTH_PX
  const desiredTickCount = Math.max(2, Math.floor(safeWidth / MIN_RULER_LABEL_SPACING_PX) + 1)
  return niceRulerInterval(safeDuration / (desiredTickCount - 1))
}

export function getEditingRulerTicks(durationSeconds: number, availableWidthPx: number): number[] {
  const safeDuration = Number.isFinite(durationSeconds) ? Math.max(0, durationSeconds) : 0
  if (safeDuration <= 0) return [0]

  const intervalSeconds = getEditingRulerIntervalSeconds(safeDuration, availableWidthPx)
  const endSeconds = Math.floor(safeDuration)
  const ticks: number[] = []
  for (let seconds = 0; seconds < endSeconds; seconds += intervalSeconds) ticks.push(seconds)
  if (ticks.length === 0 || ticks[ticks.length - 1] !== endSeconds) ticks.push(endSeconds)
  return ticks
}
