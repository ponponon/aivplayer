import type { VisionObjectDetection } from '../../shared/vision-object-detection-types'

export type VisionObjectDetectionFilter = {
  labelQuery?: string
  minimumScore?: number
}

function normalizeMinimumScore(value: number | undefined): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : 0
}

/** Filters one-frame detections without changing their order or mutating the result. */
export function filterVisionObjectDetectionCandidates(
  detections: readonly VisionObjectDetection[],
  filter: VisionObjectDetectionFilter = {}
): VisionObjectDetection[] {
  const labelQuery = filter.labelQuery?.trim().toLocaleLowerCase() ?? ''
  const minimumScore = normalizeMinimumScore(filter.minimumScore)
  return detections.filter((detection) => {
    const matchesLabel = !labelQuery || detection.label.toLocaleLowerCase().includes(labelQuery)
    return matchesLabel && detection.score >= minimumScore
  })
}
