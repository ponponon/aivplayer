import type { VisionObjectDetection } from '../../shared/vision-object-detection-types'

export type VisionObjectDetectionFilter = {
  labelQuery?: string
  minimumScore?: number
  categoryLabels?: readonly string[]
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
  const categoryLabels = new Set((filter.categoryLabels ?? []).map((label) => label.trim().toLocaleLowerCase()).filter(Boolean))
  const minimumScore = normalizeMinimumScore(filter.minimumScore)
  return detections.filter((detection) => {
    const normalizedLabel = detection.label.toLocaleLowerCase()
    const matchesLabel = !labelQuery || normalizedLabel.includes(labelQuery)
    const matchesCategory = categoryLabels.size === 0 || categoryLabels.has(normalizedLabel)
    return matchesLabel && matchesCategory && detection.score >= minimumScore
  })
}

/** Toggles one exact, case-insensitive category in a multi-select filter. */
export function toggleVisionObjectDetectionCategoryFilter(currentLabels: readonly string[], label: string): string[] {
  const normalizedLabel = label.trim().toLocaleLowerCase()
  if (!normalizedLabel) return [...currentLabels]
  const existingIndex = currentLabels.findIndex((current) => current.trim().toLocaleLowerCase() === normalizedLabel)
  if (existingIndex < 0) return [...currentLabels, label.trim()]
  return currentLabels.filter((_, index) => index !== existingIndex)
}
