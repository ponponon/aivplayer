import { normalizeVisionCollectionTag } from './clip-inbox-operations'
import type { VisionClipCollectionTagSortMode } from '../../shared/vision-types'

export const VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_STORAGE_KEY = 'aivplayer.vision-clip-collection-tag-order.v1'
export const VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_SCHEMA_VERSION = 1

export type VisionClipCollectionTagOrderPreferences = {
  schemaVersion: typeof VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_SCHEMA_VERSION
  order: string[]
  sortMode: VisionClipCollectionTagSortMode
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeOrder(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  const order: string[] = []
  for (const item of value) {
    const tag = normalizeVisionCollectionTag(item)
    if (!tag || seen.has(tag)) continue
    seen.add(tag)
    order.push(tag)
    if (order.length >= 5000) break
  }
  return order
}

function normalizeSortMode(value: unknown): VisionClipCollectionTagSortMode {
  return value === 'usage-desc' || value === 'favorite-first' || value === 'custom' ? value : 'name'
}

export function createDefaultVisionClipCollectionTagOrderPreferences(): VisionClipCollectionTagOrderPreferences {
  return { schemaVersion: VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_SCHEMA_VERSION, order: [], sortMode: 'name' }
}

export function normalizeVisionClipCollectionTagOrderPreferences(value: unknown): VisionClipCollectionTagOrderPreferences {
  const input = isRecord(value) ? value : {}
  return {
    schemaVersion: VISION_CLIP_COLLECTION_TAG_ORDER_PREFERENCES_SCHEMA_VERSION,
    order: normalizeOrder(input.order),
    sortMode: normalizeSortMode(input.sortMode)
  }
}

export function parseVisionClipCollectionTagOrderPreferences(raw: string | null): VisionClipCollectionTagOrderPreferences {
  if (!raw) return createDefaultVisionClipCollectionTagOrderPreferences()
  try {
    return normalizeVisionClipCollectionTagOrderPreferences(JSON.parse(raw) as unknown)
  } catch {
    return createDefaultVisionClipCollectionTagOrderPreferences()
  }
}

export function serializeVisionClipCollectionTagOrderPreferences(preferences: VisionClipCollectionTagOrderPreferences): string {
  return JSON.stringify(normalizeVisionClipCollectionTagOrderPreferences(preferences))
}

export function mergeVisionClipCollectionTagOrder(order: readonly string[], tags: readonly string[]): string[] {
  const available = [...new Set(tags.map(normalizeVisionCollectionTag).filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
  const availableSet = new Set(available)
  const preserved = normalizeOrder(order).filter((tag) => availableSet.has(tag))
  const preservedSet = new Set(preserved)
  return [...preserved, ...available.filter((tag) => !preservedSet.has(tag))]
}

export function moveVisionClipCollectionTagOrder(order: readonly string[], tag: string, direction: 'up' | 'down'): string[] {
  const next = normalizeOrder(order)
  const normalizedTag = normalizeVisionCollectionTag(tag)
  const index = next.indexOf(normalizedTag)
  const targetIndex = direction === 'up' ? index - 1 : index + 1
  if (index < 0 || targetIndex < 0 || targetIndex >= next.length) return next
  const target = next[targetIndex]!
  next[targetIndex] = next[index]!
  next[index] = target
  return next
}
