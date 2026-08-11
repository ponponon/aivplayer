import type { VisionObjectDetection } from '../../shared/vision-object-detection-types'

export type VisionObjectDetectionCategorySummary = {
  label: string
  count: number
  maxScore: number
}

/** Groups the current detections by a case-insensitive label for compact UI summaries. */
export function summarizeVisionObjectDetectionCandidates(
  detections: readonly VisionObjectDetection[]
): VisionObjectDetectionCategorySummary[] {
  const categories = new Map<string, VisionObjectDetectionCategorySummary>()
  for (const detection of detections) {
    const label = detection.label.trim()
    if (!label) continue
    const key = label.toLocaleLowerCase()
    const current = categories.get(key)
    if (current) {
      current.count += 1
      current.maxScore = Math.max(current.maxScore, detection.score)
      continue
    }
    categories.set(key, { label, count: 1, maxScore: detection.score })
  }

  return [...categories.values()].sort((left, right) =>
    right.count - left.count
    || right.maxScore - left.maxScore
    || left.label.localeCompare(right.label)
  )
}
