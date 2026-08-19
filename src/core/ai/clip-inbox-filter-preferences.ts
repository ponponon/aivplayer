import type { VisionCollectionTagFilterMode } from './clip-inbox-tag-tree'
import { normalizeVisionCollectionTag } from './clip-inbox-operations'

export const VISION_CLIP_COLLECTION_FILTER_PREFERENCES_STORAGE_KEY = 'aivplayer.vision-clip-collection-filter.v1'
export const VISION_CLIP_COLLECTION_FILTER_PREFERENCES_SCHEMA_VERSION = 1
export const VISION_CLIP_COLLECTION_SAVED_FILTERS_STORAGE_KEY = 'aivplayer.vision-clip-collection-saved-filters.v1'
export const VISION_CLIP_COLLECTION_SAVED_FILTERS_SCHEMA_VERSION = 1
const MAX_FILTER_QUERY_LENGTH = 200
const MAX_FILTER_TAGS = 100
const MAX_SAVED_FILTERS = 20
const MAX_SAVED_FILTER_NAME_LENGTH = 80
const MAX_SAVED_FILTER_ID_LENGTH = 120

export type VisionClipCollectionFilterVisibility = 'all' | 'active' | 'favorites' | 'archived'

export type VisionClipCollectionFilterPreferences = {
  schemaVersion: 1
  query: string
  tags: string[]
  excludedTags: string[]
  tagMode: VisionCollectionTagFilterMode
  visibility: VisionClipCollectionFilterVisibility
}

export type VisionClipCollectionSavedFilter = VisionClipCollectionFilterPreferences & {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type VisionClipCollectionSavedFilterImportResult = {
  filters: VisionClipCollectionSavedFilter[]
  importedCount: number
  skippedCount: number
}

export type VisionClipCollectionSavedFilterImportDecision = 'overwrite' | 'keep-local' | 'skip'

export type VisionClipCollectionSavedFilterImportPreviewState = 'new' | 'unchanged' | 'conflict' | 'duplicate' | 'over-limit'

export type VisionClipCollectionSavedFilterImportPreviewItem = {
  incoming: VisionClipCollectionSavedFilter
  current: VisionClipCollectionSavedFilter | null
  state: VisionClipCollectionSavedFilterImportPreviewState
}

function normalizeFilterTags(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean))].slice(0, MAX_FILTER_TAGS)
}

function normalizeFilterVisibility(value: unknown): VisionClipCollectionFilterVisibility {
  return value === 'active' || value === 'favorites' || value === 'archived' ? value : 'all'
}

export function normalizeVisionClipCollectionFilterPreferences(value: unknown): VisionClipCollectionFilterPreferences {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const query = typeof record.query === 'string' ? record.query.trim().slice(0, MAX_FILTER_QUERY_LENGTH) : ''
  return {
    schemaVersion: VISION_CLIP_COLLECTION_FILTER_PREFERENCES_SCHEMA_VERSION,
    query,
    tags: normalizeFilterTags(record.tags),
    excludedTags: normalizeFilterTags(record.excludedTags),
    tagMode: record.tagMode === 'all' ? 'all' : 'any',
    visibility: normalizeFilterVisibility(record.visibility)
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

function normalizeTimestamp(value: unknown, fallbackTimestamp: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : fallbackTimestamp
}

export function normalizeVisionClipCollectionSavedFilter(value: unknown, fallbackTimestamp = 0): VisionClipCollectionSavedFilter | null {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const id = typeof record.id === 'string' ? record.id.trim().slice(0, MAX_SAVED_FILTER_ID_LENGTH) : ''
  const name = typeof record.name === 'string' ? record.name.trim().slice(0, MAX_SAVED_FILTER_NAME_LENGTH) : ''
  if (!id || !name) return null
  const preferences = normalizeVisionClipCollectionFilterPreferences(record)
  const createdAt = normalizeTimestamp(record.createdAt, fallbackTimestamp)
  const updatedAt = Math.max(createdAt, normalizeTimestamp(record.updatedAt, createdAt))
  return { ...preferences, schemaVersion: VISION_CLIP_COLLECTION_SAVED_FILTERS_SCHEMA_VERSION, id, name, createdAt, updatedAt }
}

export function normalizeVisionClipCollectionSavedFilters(value: unknown, fallbackTimestamp = 0): VisionClipCollectionSavedFilter[] {
  if (!Array.isArray(value)) return []
  const seen = new Set<string>()
  return value
    .map((item) => normalizeVisionClipCollectionSavedFilter(item, fallbackTimestamp))
    .filter((item): item is VisionClipCollectionSavedFilter => {
      if (!item || seen.has(item.id)) return false
      seen.add(item.id)
      return true
    })
    .slice(0, MAX_SAVED_FILTERS)
}

export function parseVisionClipCollectionSavedFilters(raw: string | null, fallbackTimestamp = 0): VisionClipCollectionSavedFilter[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw) as unknown
    const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
    if (record?.schemaVersion !== VISION_CLIP_COLLECTION_SAVED_FILTERS_SCHEMA_VERSION) return []
    return normalizeVisionClipCollectionSavedFilters(record.filters, fallbackTimestamp)
  } catch {
    return []
  }
}

export function parseVisionClipCollectionSavedFilterManifest(raw: string, fallbackTimestamp = Date.now()): VisionClipCollectionSavedFilter[] {
  const parsed = JSON.parse(raw) as unknown
  const record = parsed && typeof parsed === 'object' ? parsed as Record<string, unknown> : null
  if (record?.schemaVersion !== VISION_CLIP_COLLECTION_SAVED_FILTERS_SCHEMA_VERSION || !Array.isArray(record.filters)) throw new Error('筛选视图文件格式无效')
  return normalizeVisionClipCollectionSavedFilters(record.filters, fallbackTimestamp)
}

export function serializeVisionClipCollectionSavedFilters(filters: readonly VisionClipCollectionSavedFilter[]): string {
  return JSON.stringify({ schemaVersion: VISION_CLIP_COLLECTION_SAVED_FILTERS_SCHEMA_VERSION, filters: normalizeVisionClipCollectionSavedFilters(filters) })
}

export function upsertVisionClipCollectionSavedFilter(current: readonly VisionClipCollectionSavedFilter[], next: unknown, fallbackTimestamp = 0): VisionClipCollectionSavedFilter[] {
  const normalized = normalizeVisionClipCollectionSavedFilter(next, fallbackTimestamp)
  if (!normalized) return normalizeVisionClipCollectionSavedFilters(current, fallbackTimestamp)
  return normalizeVisionClipCollectionSavedFilters([normalized, ...current.filter((item) => item.id !== normalized.id)], fallbackTimestamp)
}

export function removeVisionClipCollectionSavedFilter(current: readonly VisionClipCollectionSavedFilter[], id: string): VisionClipCollectionSavedFilter[] {
  return normalizeVisionClipCollectionSavedFilters(current.filter((item) => item.id !== id))
}

function savedFilterKey(filter: VisionClipCollectionSavedFilter): string {
  return `${filter.query.toLocaleLowerCase()}\0${filter.tagMode}\0${filter.visibility}\0${[...filter.tags].sort().join('\0')}\0!${[...filter.excludedTags].sort().join('\0')}`
}

function sameSavedFilter(left: VisionClipCollectionSavedFilter, right: VisionClipCollectionSavedFilter): boolean {
  return left.id === right.id
    && left.name === right.name
    && left.query === right.query
    && left.excludedTags.length === right.excludedTags.length
    && left.excludedTags.every((tag, index) => tag === right.excludedTags[index])
    && left.tagMode === right.tagMode
    && left.visibility === right.visibility
    && left.tags.length === right.tags.length
    && left.tags.every((tag, index) => tag === right.tags[index])
    && left.createdAt === right.createdAt
    && left.updatedAt === right.updatedAt
}

export function createVisionClipCollectionSavedFilterImportPreview(
  current: readonly VisionClipCollectionSavedFilter[],
  imported: readonly VisionClipCollectionSavedFilter[]
): VisionClipCollectionSavedFilterImportPreviewItem[] {
  const existing = normalizeVisionClipCollectionSavedFilters(current)
  const currentById = new Map(existing.map((filter) => [filter.id, filter]))
  const currentByKey = new Map(existing.map((filter) => [savedFilterKey(filter), filter]))
  const seenKeys = new Set<string>()
  let newCount = 0
  return normalizeVisionClipCollectionSavedFilters(imported).map((incoming) => {
    const key = savedFilterKey(incoming)
    const currentByFilter = currentByKey.get(key) ?? null
    const currentByIdentifier = currentById.get(incoming.id) ?? null
    if (seenKeys.has(key)) return { incoming, current: currentByFilter, state: currentByFilter ? 'conflict' : 'duplicate' }
    seenKeys.add(key)
    if (currentByFilter && currentByIdentifier && sameSavedFilter(incoming, currentByFilter) && currentByFilter.id === currentByIdentifier.id) {
      return { incoming, current: currentByFilter, state: 'unchanged' }
    }
    if (currentByFilter || currentByIdentifier) {
      return { incoming, current: currentByFilter ?? currentByIdentifier, state: 'conflict' }
    }
    if (existing.length + newCount >= MAX_SAVED_FILTERS) return { incoming, current: null, state: 'over-limit' }
    newCount += 1
    return { incoming, current: null, state: 'new' }
  })
}

export function applyVisionClipCollectionSavedFilterImportPreview(
  current: readonly VisionClipCollectionSavedFilter[],
  preview: readonly VisionClipCollectionSavedFilterImportPreviewItem[],
  decisions: Readonly<Record<string, VisionClipCollectionSavedFilterImportDecision>> = {}
): VisionClipCollectionSavedFilterImportResult {
  let next = normalizeVisionClipCollectionSavedFilters(current)
  let importedCount = 0
  let skippedCount = 0
  for (const item of preview) {
    const decision = decisions[item.incoming.id] ?? 'keep-local'
    if (item.state === 'new') {
      if (next.length >= MAX_SAVED_FILTERS || next.some((filter) => savedFilterKey(filter) === savedFilterKey(item.incoming))) {
        skippedCount += 1
        continue
      }
      next = [...next, item.incoming]
      importedCount += 1
      continue
    }
    if (item.state !== 'conflict' || decision !== 'overwrite') {
      skippedCount += 1
      continue
    }
    const incomingKey = savedFilterKey(item.incoming)
    next = [item.incoming, ...next.filter((filter) => filter.id !== item.incoming.id && savedFilterKey(filter) !== incomingKey)]
    importedCount += 1
  }
  return { filters: normalizeVisionClipCollectionSavedFilters(next), importedCount, skippedCount }
}

export function mergeVisionClipCollectionSavedFilters(current: readonly VisionClipCollectionSavedFilter[], imported: readonly VisionClipCollectionSavedFilter[]): VisionClipCollectionSavedFilterImportResult {
  const existing = normalizeVisionClipCollectionSavedFilters(current)
  const next = [...existing]
  const seenIds = new Set(next.map((filter) => filter.id))
  const seenKeys = new Set(next.map(savedFilterKey))
  let importedCount = 0
  let skippedCount = 0
  for (const candidate of normalizeVisionClipCollectionSavedFilters(imported)) {
    const key = savedFilterKey(candidate)
    if (seenKeys.has(key) || next.length >= MAX_SAVED_FILTERS) {
      skippedCount += 1
      continue
    }
    let id = candidate.id
    if (seenIds.has(id)) {
      let suffix = 1
      do {
        id = `${candidate.id}-import-${suffix}`.slice(0, MAX_SAVED_FILTER_ID_LENGTH)
        suffix += 1
      } while (seenIds.has(id))
    }
    const importedFilter = { ...candidate, id }
    next.push(importedFilter)
    seenIds.add(id)
    seenKeys.add(key)
    importedCount += 1
  }
  return { filters: normalizeVisionClipCollectionSavedFilters(next), importedCount, skippedCount }
}

/** Drops saved tags that no longer occur in the loaded collection set. */
export function mergeVisionClipCollectionFilterTags(selectedTags: Iterable<unknown>, activeTags: readonly unknown[]): string[] {
  const active = new Set(activeTags.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean))
  return [...new Set([...selectedTags].map((tag) => normalizeVisionCollectionTag(tag)).filter((tag) => active.has(tag)))].slice(0, MAX_FILTER_TAGS)
}
