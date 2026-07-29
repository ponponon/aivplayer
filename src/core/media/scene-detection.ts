export const DEFAULT_SCENE_DETECTION_THRESHOLD = 0.18
export const DEFAULT_MIN_SCENE_DURATION_SECONDS = 0.8

const PTS_TIME_PATTERN = /pts_time:([0-9]+(?:\.[0-9]+)?)/g

/** Parses timestamps emitted by FFmpeg's showinfo filter and removes cuts that are too close together. */
export function parseSceneCutTimestamps(output: string, minSceneDurationSeconds = DEFAULT_MIN_SCENE_DURATION_SECONDS): number[] {
  const minGap = Number.isFinite(minSceneDurationSeconds) ? Math.max(0.1, minSceneDurationSeconds) : DEFAULT_MIN_SCENE_DURATION_SECONDS
  const timestamps: number[] = []
  for (const match of output.matchAll(PTS_TIME_PATTERN)) {
    const timestamp = Number(match[1])
    if (!Number.isFinite(timestamp) || timestamp <= 0) continue
    if (timestamps.length === 0 || timestamp - timestamps[timestamps.length - 1]! >= minGap) timestamps.push(timestamp)
  }
  return timestamps
}

/** Keeps only cuts that can produce two usable segments inside the selected source range. */
export function filterSceneCutsForSourceRange(
  timestamps: readonly number[],
  sourceStartSeconds: number,
  sourceEndSeconds: number,
  minimumSegmentSeconds = 0.4
): number[] {
  const start = Math.min(sourceStartSeconds, sourceEndSeconds)
  const end = Math.max(sourceStartSeconds, sourceEndSeconds)
  const minimum = Number.isFinite(minimumSegmentSeconds) ? Math.max(0.1, minimumSegmentSeconds) : 0.4
  const cuts: number[] = []
  for (const timestamp of [...timestamps].sort((left, right) => left - right)) {
    if (!Number.isFinite(timestamp) || timestamp <= start + minimum || timestamp >= end - minimum) continue
    if (cuts.length === 0 || timestamp - cuts[cuts.length - 1]! >= minimum) cuts.push(timestamp)
  }
  return cuts
}
