import type { VisionClipCollectionTagMetadata } from '../../shared/vision-types'
import { normalizeVisionCollectionTag } from './clip-inbox-operations'

export const VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_STORAGE_KEY = 'aivplayer.vision-clip-collection-tag-collapse.v1'
export const VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_SCHEMA_VERSION = 1

export type VisionClipCollectionTagCollapsePreferences = {
  schemaVersion: 1
  collapsedTags: string[]
}

function createVisionCollectionTagParentMap(metadata: readonly VisionClipCollectionTagMetadata[]): Map<string, string> {
  return new Map(metadata
    .map((item) => [normalizeVisionCollectionTag(item.tag), normalizeVisionCollectionTag(item.parentTag)] as const)
    .filter(([tag]) => Boolean(tag)))
}

export function normalizeVisionClipCollectionTagCollapsePreferences(value: unknown): VisionClipCollectionTagCollapsePreferences {
  const record = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const collapsedTags = Array.isArray(record.collapsedTags)
    ? [...new Set(record.collapsedTags.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean))].slice(0, 5000)
    : []
  return { schemaVersion: VISION_CLIP_COLLECTION_TAG_COLLAPSE_PREFERENCES_SCHEMA_VERSION, collapsedTags }
}

export function parseVisionClipCollectionTagCollapsePreferences(raw: string | null): VisionClipCollectionTagCollapsePreferences {
  if (!raw) return normalizeVisionClipCollectionTagCollapsePreferences(null)
  try {
    return normalizeVisionClipCollectionTagCollapsePreferences(JSON.parse(raw) as unknown)
  } catch {
    return normalizeVisionClipCollectionTagCollapsePreferences(null)
  }
}

export function serializeVisionClipCollectionTagCollapsePreferences(preferences: VisionClipCollectionTagCollapsePreferences): string {
  return JSON.stringify(normalizeVisionClipCollectionTagCollapsePreferences(preferences))
}

/** Retains collapsed tags that are still present without collapsing newly discovered tags. */
export function mergeVisionClipCollectionTagCollapsePreferences(collapsedTags: Iterable<unknown>, activeTags: readonly unknown[]): string[] {
  const active = new Set(activeTags.map((tag) => normalizeVisionCollectionTag(tag)).filter(Boolean))
  return [...new Set([...collapsedTags].map((tag) => normalizeVisionCollectionTag(tag)).filter((tag) => active.has(tag)))]
}

/** Returns the directly nested tags below a parent, in a stable display order. */
export function getVisionCollectionTagChildren(tag: unknown, metadata: readonly VisionClipCollectionTagMetadata[]): string[] {
  const normalizedTag = normalizeVisionCollectionTag(tag)
  if (!normalizedTag) return []
  return [...new Set(metadata
    .filter((item) => normalizeVisionCollectionTag(item.parentTag) === normalizedTag)
    .map((item) => normalizeVisionCollectionTag(item.tag))
    .filter(Boolean))].sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
}

/** Reports whether a tag has a directly nested child. */
export function hasVisionCollectionTagChildren(tag: unknown, metadata: readonly VisionClipCollectionTagMetadata[]): boolean {
  return getVisionCollectionTagChildren(tag, metadata).length > 0
}

/** Reports whether a tag is the selected tag or one of its descendants. */
export function isVisionCollectionTagDescendantOrSelf(tag: unknown, ancestorTag: unknown, metadata: readonly VisionClipCollectionTagMetadata[]): boolean {
  const normalizedTag = normalizeVisionCollectionTag(tag)
  const normalizedAncestorTag = normalizeVisionCollectionTag(ancestorTag)
  if (!normalizedTag || !normalizedAncestorTag) return false
  const parents = createVisionCollectionTagParentMap(metadata)
  const visited = new Set<string>()
  let current = normalizedTag
  while (current && !visited.has(current)) {
    if (current === normalizedAncestorTag) return true
    visited.add(current)
    current = parents.get(current) ?? ''
  }
  return false
}

/** Reports whether a tag is hidden by a collapsed parent somewhere above it. */
export function isVisionCollectionTagHiddenByCollapsedAncestor(
  tag: unknown,
  metadata: readonly VisionClipCollectionTagMetadata[],
  collapsedTags: Iterable<unknown>,
): boolean {
  const normalizedTag = normalizeVisionCollectionTag(tag)
  if (!normalizedTag) return false
  const collapsed = new Set([...collapsedTags].map((value) => normalizeVisionCollectionTag(value)).filter(Boolean))
  const parents = createVisionCollectionTagParentMap(metadata)
  const visited = new Set<string>([normalizedTag])
  let current = parents.get(normalizedTag) ?? ''
  while (current) {
    if (collapsed.has(current)) return true
    if (visited.has(current)) return false
    visited.add(current)
    current = parents.get(current) ?? ''
  }
  return false
}
