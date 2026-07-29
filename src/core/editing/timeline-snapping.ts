const DEFAULT_SNAP_THRESHOLD_SECONDS = 0.12

function clamp(seconds: number, durationSeconds: number): number {
  return Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), Math.max(0, durationSeconds))
}

/** Snaps a pointer-derived edited time to nearby cuts, the playhead, or a whole second. */
export function snapEditedTime(
  seconds: number,
  durationSeconds: number,
  snapPoints: readonly number[] = [],
  thresholdSeconds = DEFAULT_SNAP_THRESHOLD_SECONDS
): number {
  const safeSeconds = clamp(seconds, durationSeconds)
  const candidates = [Math.round(safeSeconds), ...snapPoints]
    .filter((candidate) => Number.isFinite(candidate))
    .map((candidate) => clamp(candidate, durationSeconds))
  let nearest = safeSeconds
  let distance = thresholdSeconds
  for (const candidate of candidates) {
    const candidateDistance = Math.abs(candidate - safeSeconds)
    if (candidateDistance <= distance) {
      nearest = candidate
      distance = candidateDistance
    }
  }
  return nearest
}
