import type { VisionClipCollectionTagMetadata } from '../../shared/vision-types'
import { normalizeVisionCollectionTag } from './clip-inbox-operations'

function createVisionCollectionTagParentMap(metadata: readonly VisionClipCollectionTagMetadata[]): Map<string, string> {
  return new Map(metadata
    .map((item) => [normalizeVisionCollectionTag(item.tag), normalizeVisionCollectionTag(item.parentTag)] as const)
    .filter(([tag]) => Boolean(tag)))
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
