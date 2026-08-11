import type { VisionObjectDetection, VisionObjectDetectionFilterState } from '../../shared/vision-object-detection-types'

export type VisionObjectDetectionFilter = {
  labelQuery?: string
  minimumScore?: number
  categoryLabels?: readonly string[]
}

const MAX_OBJECT_LABEL_QUERY_LENGTH = 200
const MAX_OBJECT_CATEGORY_LABELS = 20
const MAX_OBJECT_CATEGORY_LABEL_LENGTH = 120

function normalizeText(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : ''
}

/** Normalizes a persisted or IPC-provided object filter and omits the default state. */
export function normalizeVisionObjectDetectionFilterState(value: unknown): VisionObjectDetectionFilterState | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const raw = value as Partial<VisionObjectDetectionFilterState>
  const labelQuery = normalizeText(raw.labelQuery, MAX_OBJECT_LABEL_QUERY_LENGTH)
  const minimumScore = typeof raw.minimumScore === 'number' && Number.isFinite(raw.minimumScore)
    ? Math.min(1, Math.max(0, raw.minimumScore))
    : 0
  const categoryLabels: string[] = []
  const seen = new Set<string>()
  if (Array.isArray(raw.categoryLabels)) {
    for (const value of raw.categoryLabels) {
      const label = normalizeText(value, MAX_OBJECT_CATEGORY_LABEL_LENGTH)
      const normalizedLabel = label.toLocaleLowerCase()
      if (!label || seen.has(normalizedLabel)) continue
      seen.add(normalizedLabel)
      categoryLabels.push(label)
      if (categoryLabels.length >= MAX_OBJECT_CATEGORY_LABELS) break
    }
  }
  if (!labelQuery && minimumScore === 0 && categoryLabels.length === 0) return undefined
  return { labelQuery, minimumScore, categoryLabels }
}

export function isVisionObjectDetectionFilterActive(filter: VisionObjectDetectionFilter | undefined): boolean {
  return Boolean(filter?.labelQuery?.trim() || (filter?.minimumScore ?? 0) > 0 || filter?.categoryLabels?.some((label) => label.trim()))
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
