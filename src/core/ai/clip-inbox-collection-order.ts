import type { VisionClipCollection } from '../../shared/vision-types'

export const VISION_CLIP_COLLECTION_ORDER_PREFERENCES_STORAGE_KEY = 'aivplayer.vision-clip-collection-order.v1'
export const VISION_CLIP_COLLECTION_ORDER_PREFERENCES_SCHEMA_VERSION = 1

export type VisionClipCollectionListSortMode = 'updated-desc' | 'title-asc' | 'selection-count-desc' | 'duration-desc'

export type VisionClipCollectionOrderPreferences = {
  schemaVersion: 1
  sortMode: VisionClipCollectionListSortMode
}

const DEFAULT_SORT_MODE: VisionClipCollectionListSortMode = 'updated-desc'

function isSortMode(value: unknown): value is VisionClipCollectionListSortMode {
  return value === 'updated-desc' || value === 'title-asc' || value === 'selection-count-desc' || value === 'duration-desc'
}

export function normalizeVisionClipCollectionOrderPreferences(value: unknown): VisionClipCollectionOrderPreferences {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  return {
    schemaVersion: VISION_CLIP_COLLECTION_ORDER_PREFERENCES_SCHEMA_VERSION,
    sortMode: isSortMode(record.sortMode) ? record.sortMode : DEFAULT_SORT_MODE
  }
}

export function parseVisionClipCollectionOrderPreferences(raw: string | null): VisionClipCollectionOrderPreferences {
  if (!raw) return normalizeVisionClipCollectionOrderPreferences(null)
  try {
    return normalizeVisionClipCollectionOrderPreferences(JSON.parse(raw) as unknown)
  } catch {
    return normalizeVisionClipCollectionOrderPreferences(null)
  }
}

export function serializeVisionClipCollectionOrderPreferences(preferences: VisionClipCollectionOrderPreferences): string {
  return JSON.stringify(normalizeVisionClipCollectionOrderPreferences(preferences))
}

function collectionDurationSeconds(collection: VisionClipCollection): number {
  return collection.selections.reduce((total, selection) => total + Math.max(0, selection.endSeconds - selection.startSeconds), 0)
}

function compareTitles(left: VisionClipCollection, right: VisionClipCollection): number {
  return left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }) || left.id.localeCompare(right.id)
}

function compareUpdatedAt(left: VisionClipCollection, right: VisionClipCollection): number {
  return right.updatedAt - left.updatedAt || right.createdAt - left.createdAt || compareTitles(left, right)
}

export function sortVisionClipCollections(collections: readonly VisionClipCollection[], sortMode: VisionClipCollectionListSortMode): VisionClipCollection[] {
  return [...collections].sort((left, right) => {
    if (sortMode === 'title-asc') return compareTitles(left, right) || compareUpdatedAt(left, right)
    if (sortMode === 'selection-count-desc') return right.selections.length - left.selections.length || compareUpdatedAt(left, right)
    if (sortMode === 'duration-desc') return collectionDurationSeconds(right) - collectionDurationSeconds(left) || compareUpdatedAt(left, right)
    return compareUpdatedAt(left, right)
  })
}
