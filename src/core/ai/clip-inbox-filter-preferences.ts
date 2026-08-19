import type { VisionCollectionTagFilterMode } from './clip-inbox-tag-tree'
import { normalizeVisionCollectionTag } from './clip-inbox-operations'

export const VISION_CLIP_COLLECTION_FILTER_PREFERENCES_STORAGE_KEY = 'aivplayer.vision-clip-collection-filter.v1'
export const VISION_CLIP_COLLECTION_FILTER_PREFERENCES_SCHEMA_VERSION = 1
const MAX_FILTER_QUERY_LENGTH = 200
const MAX_FILTER_TAGS = 100

export type VisionClipCollectionFilterPreferences = {
  schemaVersion: 1
  query: string
  tags: string[]
  tagMode: VisionCollectionTagFilterMode
}

function normalizeFilterTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean))].slice(0, MAX_FILTER_TAGS)
}

export function normalizeVisionClipCollectionFilterPreferences(value: unknown): VisionClipCollectionFilterPreferences {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const query = typeof record.query === 'string' ? record.query.trim().slice(0, MAX_FILTER_QUERY_LENGTH) : ''
  return {
    schemaVersion: VISION_CLIP_COLLECTION_FILTER_PREFERENCES_SCHEMA_VERSION,
    query,
    tags: normalizeFilterTags(record.tags),
    tagMode: record.tagMode === 'all' ? 'all' : 'any'
  }
}

export function parseVisionClipCollectionFilterPreferences(raw: string | null): VisionClipCollectionFilterPreferences {
  if (!raw) return normalizeVisionClipCollectionFilterPreferences(null)
  try {
    return normalizeVisionClipCollectionFilterPreferences(JSON.parse(raw) as unknown)
  } catch {
    return normalizeVisionClipCollectionFilterPreferences(null)
  }
}

export function serializeVisionClipCollectionFilterPreferences(preferences: VisionClipCollectionFilterPreferences): string {
  return JSON.stringify(normalizeVisionClipCollectionFilterPreferences(preferences))
}

/** Drops saved tags that no longer occur in the loaded collection set. */
export function mergeVisionClipCollectionFilterTags(selectedTags: Iterable<unknown>, activeTags: readonly unknown[]): string[] {
  const active = new Set(activeTags.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean))
  return [...new Set([...selectedTags].map((tag) => normalizeVisionCollectionTag(tag)).filter((tag) => active.has(tag)))].slice(0, MAX_FILTER_TAGS)
}
