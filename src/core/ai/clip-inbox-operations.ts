import { mergeVisionClipSelections, normalizeVisionTimeRange } from './vision-evidence'
import type { VisionClipCollection, VisionClipCollectionBatchTagsMode, VisionClipCollectionInput, VisionClipCollectionMergePreview, VisionClipCollectionMergePreviewSource, VisionClipCollectionMergeSelection, VisionClipCollectionSortMode, VisionClipCollectionTagMetadata, VisionClipSelection } from '../../shared/vision-types'

const MAX_COLLECTION_TAGS = 20
const MAX_COLLECTION_TAG_LENGTH = 40
export const MAX_VISION_COLLECTION_TAG_NOTE_LENGTH = 240
export const MAX_CLIP_COLLECTION_BATCH_DUPLICATES = 20
export const MAX_CLIP_COLLECTION_RENAME_PART_LENGTH = 40
export const MAX_CLIP_COLLECTION_TITLE_LENGTH = 200

export function duplicateVisionCollectionTitle(title: string): string {
  const normalizedTitle = title.trim() || '未命名选段集合'
  return `${normalizedTitle} · 副本`
}

export function normalizeVisionClipCollectionRenamePart(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return ''
  return value.slice(0, MAX_CLIP_COLLECTION_RENAME_PART_LENGTH)
}

export function renameVisionClipCollectionTitle(title: string, prefix: unknown, suffix: unknown): string {
  const normalizedTitle = title.trim() || '未命名选段集合'
  const renamedTitle = `${normalizeVisionClipCollectionRenamePart(prefix)}${normalizedTitle}${normalizeVisionClipCollectionRenamePart(suffix)}`.trim()
  return (renamedTitle || normalizedTitle).slice(0, MAX_CLIP_COLLECTION_TITLE_LENGTH)
}

export function normalizeVisionClipCollectionIds(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean))].slice(0, MAX_CLIP_COLLECTION_BATCH_DUPLICATES)
}

/** Adds or removes only the currently visible collection ids while preserving other selections. */
export function toggleVisibleVisionClipCollectionSelection(currentIds: Iterable<unknown>, visibleIds: readonly unknown[], selectVisible: boolean): string[] {
  const selected = new Set([...currentIds]
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean))
  const normalizedVisibleIds = [...new Set(visibleIds
    .filter((id): id is string => typeof id === 'string')
    .map((id) => id.trim())
    .filter(Boolean))]
  for (const id of normalizedVisibleIds) {
    if (selectVisible) selected.add(id)
    else selected.delete(id)
  }
  return [...selected]
}

export function normalizeVisionCollectionTags(value: unknown): string[] {
  const values = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : []
  return [...new Set(values
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim().slice(0, MAX_COLLECTION_TAG_LENGTH))
    .filter(Boolean))].slice(0, MAX_COLLECTION_TAGS)
}

export function normalizeVisionCollectionTag(value: unknown): string {
  const tags = normalizeVisionCollectionTags(value)
  return tags.length === 1 ? tags[0] ?? '' : ''
}

export function normalizeVisionCollectionTagColor(value: unknown): string {
  if (typeof value !== 'string') return ''
  const color = value.trim().toLowerCase()
  return /^#[0-9a-f]{6}$/.test(color) ? color : ''
}

export function normalizeVisionCollectionTagNote(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim().slice(0, MAX_VISION_COLLECTION_TAG_NOTE_LENGTH)
}

export function normalizeVisionCollectionTagFavorite(value: unknown): boolean {
  return value === true || value === 1 || value === '1'
}

export function wouldCreateVisionCollectionTagParentCycle(tag: unknown, parentTag: unknown, metadata: readonly VisionClipCollectionTagMetadata[]): boolean {
  const normalizedTag = normalizeVisionCollectionTag(tag)
  const normalizedParentTag = normalizeVisionCollectionTag(parentTag)
  if (!normalizedTag || !normalizedParentTag) return false
  const parents = new Map(metadata.map((item) => [normalizeVisionCollectionTag(item.tag), normalizeVisionCollectionTag(item.parentTag)]))
  const visited = new Set<string>()
  let current = normalizedParentTag
  while (current) {
    if (current === normalizedTag || visited.has(current)) return true
    visited.add(current)
    current = parents.get(current) ?? ''
  }
  return false
}

export function getVisionCollectionTagPath(tag: unknown, metadata: readonly VisionClipCollectionTagMetadata[]): string[] {
  const normalizedTag = normalizeVisionCollectionTag(tag)
  if (!normalizedTag) return []
  const parents = new Map(metadata.map((item) => [normalizeVisionCollectionTag(item.tag), normalizeVisionCollectionTag(item.parentTag)]))
  const path: string[] = []
  const visited = new Set<string>()
  let current = normalizedTag
  while (current && !visited.has(current)) {
    path.unshift(current)
    visited.add(current)
    current = parents.get(current) ?? ''
  }
  return path
}

export function renameVisionCollectionTag(currentTags: unknown, fromTag: unknown, toTag: unknown): string[] {
  const normalizedFromTag = normalizeVisionCollectionTag(fromTag)
  const normalizedToTag = normalizeVisionCollectionTag(toTag)
  const normalizedCurrentTags = normalizeVisionCollectionTags(currentTags)
  if (!normalizedFromTag || !normalizedToTag || normalizedFromTag === normalizedToTag) return normalizedCurrentTags
  return normalizeVisionCollectionTags(normalizedCurrentTags.map((tag) => tag === normalizedFromTag ? normalizedToTag : tag))
}

export function normalizeVisionCollectionTagsMode(value: unknown): VisionClipCollectionBatchTagsMode {
  return value === 'add' || value === 'remove' ? value : 'replace'
}

export function applyVisionCollectionTags(currentTags: unknown, incomingTags: unknown, mode: unknown = 'replace'): string[] {
  const normalizedCurrentTags = normalizeVisionCollectionTags(currentTags)
  const normalizedIncomingTags = normalizeVisionCollectionTags(incomingTags)
  const normalizedMode = normalizeVisionCollectionTagsMode(mode)
  if (normalizedMode === 'replace') return normalizedIncomingTags
  if (normalizedMode === 'add') return normalizeVisionCollectionTags([...normalizedCurrentTags, ...normalizedIncomingTags])
  const tagsToRemove = new Set(normalizedIncomingTags)
  return normalizedCurrentTags.filter((tag) => !tagsToRemove.has(tag))
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

/** Returns a stable key for selecting a source range during a collection merge. */
export function getVisionClipSelectionMergeKey(selection: Pick<VisionClipSelection, 'sourceId' | 'videoPath' | 'fingerprint' | 'startSeconds' | 'endSeconds'>): string {
  return JSON.stringify([selection.sourceId, selection.videoPath, selection.fingerprint, selection.startSeconds, selection.endSeconds])
}

/** Applies per-collection source-range selections without mutating stored collections. */
export function selectVisionClipCollectionsForMerge(collections: readonly VisionClipCollection[], selectedSelections?: readonly VisionClipCollectionMergeSelection[]): VisionClipCollection[] {
  const uniqueCollections = [...new Map(collections.map((collection) => [collection.id, collection])).values()]
  const selectedKeysByCollection = new Map((selectedSelections ?? []).map((item) => [item.collectionId, {
    keys: new Set(item.selectionKeys.filter((key) => typeof key === 'string' && key.length > 0)),
    rangeOverrides: new Map((item.rangeOverrides ?? []).filter((override) => typeof override?.selectionKey === 'string').map((override) => [override.selectionKey, override]))
  }]))
  return uniqueCollections.map((collection) => {
    const selectionConfig = selectedKeysByCollection.get(collection.id)
    const selections = collection.selections
      .filter((selection) => selectionConfig === undefined || selectionConfig.keys.has(getVisionClipSelectionMergeKey(selection)))
      .map((selection) => {
        const override = selectionConfig?.rangeOverrides.get(getVisionClipSelectionMergeKey(selection))
        const range = override ? normalizeVisionTimeRange(override, selection.durationSeconds) : { startSeconds: selection.startSeconds, endSeconds: selection.endSeconds }
        if (!range) return null
        return { ...selection, ...range, evidenceIds: [...selection.evidenceIds], evidenceTypes: [...selection.evidenceTypes] }
      })
      .filter((selection): selection is VisionClipSelection => selection !== null)
    return { ...collection, tags: [...collection.tags], selections }
  })
}

/** Builds a new collection from several collections without mutating the originals. */
export function mergeVisionClipCollections(collections: readonly VisionClipCollection[], title: unknown, sortMode: unknown = 'source-time'): VisionClipCollectionInput {
  const uniqueCollections = [...new Map(collections.map((collection) => [collection.id, collection])).values()]
  if (uniqueCollections.length < 2) throw new Error('至少需要两个不同的选段集合')
  const normalizedTitle = typeof title === 'string' ? title.trim().slice(0, MAX_CLIP_COLLECTION_TITLE_LENGTH) : ''
  if (!normalizedTitle) throw new Error('合并后的选段集合名称不能为空')

  const selectionsBySource = new Map<string, VisionClipSelection[]>()
  for (const collection of uniqueCollections) {
    for (const selection of collection.selections) {
      const sourceKey = `${selection.sourceId}\0${selection.videoPath}\0${selection.fingerprint}`
      const sourceSelections = selectionsBySource.get(sourceKey) ?? []
      sourceSelections.push(selection)
      selectionsBySource.set(sourceKey, sourceSelections)
    }
  }
  const normalizedSortMode = normalizeVisionCollectionSortMode(sortMode)
  const selections = sortVisionClipSelections(
    [...selectionsBySource.values()].flatMap((sourceSelections) => mergeVisionClipSelections(sourceSelections, 0.5)),
    normalizedSortMode
  )
  if (selections.length === 0) throw new Error('选段集合至少需要一个有效选段')
  return {
    title: normalizedTitle,
    tags: normalizeVisionCollectionTags(uniqueCollections.flatMap((collection) => collection.tags)),
    sortMode: normalizedSortMode,
    isFavorite: false,
    isArchived: false,
    selections
  }
}

/** Builds an inspectable merge preview without mutating source collections. */
export function previewVisionClipCollectionMerge(collections: readonly VisionClipCollection[], title: unknown, sortMode: unknown = 'source-time', selectedSelections?: readonly VisionClipCollectionMergeSelection[]): VisionClipCollectionMergePreview {
  const uniqueCollections = [...new Map(collections.map((collection) => [collection.id, collection])).values()]
  const selectedCollections = selectVisionClipCollectionsForMerge(uniqueCollections, selectedSelections)
  const sources: VisionClipCollectionMergePreviewSource[] = uniqueCollections.map((collection) => ({
    collectionId: collection.id,
    title: collection.title,
    selections: collection.selections.map((selection) => ({
      ...selection,
      evidenceIds: [...selection.evidenceIds],
      evidenceTypes: [...selection.evidenceTypes]
    }))
  }))
  const selectedKeysByCollection = new Map((selectedSelections ?? []).map((item) => [item.collectionId, new Set(item.selectionKeys)]))
  const selectedKeys = uniqueCollections.map((collection) => {
    const selectionConfig = selectedSelections?.find((item) => item.collectionId === collection.id)
    const rangeOverrides = selectionConfig?.rangeOverrides?.filter((override) => typeof override.selectionKey === 'string' && Number.isFinite(override.startSeconds) && Number.isFinite(override.endSeconds))
    return {
      collectionId: collection.id,
      selectionKeys: collection.selections
        .filter((selection) => selectedKeysByCollection.get(collection.id)?.has(getVisionClipSelectionMergeKey(selection)) ?? true)
        .map((selection) => getVisionClipSelectionMergeKey(selection)),
      ...(rangeOverrides && rangeOverrides.length > 0 ? { rangeOverrides: rangeOverrides.map((override) => ({ ...override })) } : {})
    }
  })
  return { collection: mergeVisionClipCollections(selectedCollections, title, sortMode), sources, selectedSelections: selectedKeys }
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
