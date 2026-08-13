import { mergeVisionClipSelections, normalizeVisionTimeRange } from './vision-evidence'
import type { VisionClipCollectionSortMode, VisionClipSelection } from '../../shared/vision-types'

const MAX_COLLECTION_TAGS = 20
const MAX_COLLECTION_TAG_LENGTH = 40
export const MAX_CLIP_COLLECTION_BATCH_DUPLICATES = 20

export function duplicateVisionCollectionTitle(title: string): string {
  const normalizedTitle = title.trim() || '未命名选段集合'
  return `${normalizedTitle} · 副本`
}

export function normalizeVisionClipCollectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean))].slice(0, MAX_CLIP_COLLECTION_BATCH_DUPLICATES)
}

export function normalizeVisionCollectionTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(values
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().slice(0, MAX_COLLECTION_TAG_LENGTH))
    .filter(Boolean))].slice(0, MAX_COLLECTION_TAGS)
}

export function normalizeVisionCollectionSortMode(value: unknown): VisionClipCollectionSortMode {
  return value === 'duration-desc' || value === 'file-name' ? value : 'source-time'
}

function sourceTimeCompare(left: VisionClipSelection, right: VisionClipSelection): number {
  return left.sourceId.localeCompare(right.sourceId, undefined, { sensitivity: 'base' })
    || left.videoPath.localeCompare(right.videoPath, undefined, { sensitivity: 'base' })
    || left.startSeconds - right.startSeconds
    || left.endSeconds - right.endSeconds
}

export function sortVisionClipSelections(selections: readonly VisionClipSelection[], mode: VisionClipCollectionSortMode = 'source-time'): VisionClipSelection[] {
  const normalizedMode = normalizeVisionCollectionSortMode(mode)
  return [...selections].sort((left, right) => {
    if (normalizedMode === 'duration-desc') {
      const durationDifference = (right.endSeconds - right.startSeconds) - (left.endSeconds - left.startSeconds)
      return durationDifference || sourceTimeCompare(left, right)
    }
    if (normalizedMode === 'file-name') {
      return left.fileName.localeCompare(right.fileName, undefined, { numeric: true, sensitivity: 'base' }) || sourceTimeCompare(left, right)
    }
    return sourceTimeCompare(left, right)
  }).map((selection) => ({
    ...selection,
    evidenceIds: [...selection.evidenceIds],
    evidenceTypes: [...selection.evidenceTypes]
  }))
}

export function mergeVisionCollectionSelections(selections: readonly VisionClipSelection[], mergeGapSeconds = 0.5): VisionClipSelection[] {
  return mergeVisionClipSelections(selections, mergeGapSeconds)
}

function selectionGroupKey(selection: VisionClipSelection): string {
  return `${selection.sourceId}\0${selection.videoPath}`
}

/** Returns the unselected time ranges for each source represented by a collection. */
export function invertVisionClipSelections(selections: readonly VisionClipSelection[]): VisionClipSelection[] {
  const merged = mergeVisionClipSelections(selections)
  const groups = new Map<string, VisionClipSelection[]>()
  for (const selection of merged) {
    const group = groups.get(selectionGroupKey(selection)) ?? []
    group.push(selection)
    groups.set(selectionGroupKey(selection), group)
  }

  const inverted: VisionClipSelection[] = []
  for (const group of groups.values()) {
    const ordered = [...group].sort((left, right) => left.startSeconds - right.startSeconds)
    const template = ordered[0]
    if (!template) continue
    const duration = Math.max(...ordered.map((selection) => selection.durationSeconds))
    let cursor = 0
    for (const selection of ordered) {
      const range = normalizeVisionTimeRange({ startSeconds: cursor, endSeconds: selection.startSeconds }, duration)
      if (range) inverted.push({ ...template, ...range, evidenceIds: [], evidenceTypes: [], text: undefined })
      cursor = Math.max(cursor, selection.endSeconds)
    }
    const tail = normalizeVisionTimeRange({ startSeconds: cursor, endSeconds: duration }, duration)
    if (tail) inverted.push({ ...template, ...tail, evidenceIds: [], evidenceTypes: [], text: undefined })
  }
  return sortVisionClipSelections(inverted, 'source-time')
}
