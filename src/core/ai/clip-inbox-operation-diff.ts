import type { VisionClipCollectionOperationCollectionDetail, VisionClipCollectionOperationCollectionDiff, VisionClipCollectionOperationDetailChange, VisionClipCollectionOperationDetailField } from '../../shared/vision-types'

export const VISION_CLIP_COLLECTION_OPERATION_DETAIL_FIELDS: readonly VisionClipCollectionOperationDetailField[] = ['title', 'tags', 'flags', 'sortMode', 'selectionCount']

function sameTags(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((tag, index) => tag === right[index])
}

function sameField(left: VisionClipCollectionOperationCollectionDetail, right: VisionClipCollectionOperationCollectionDetail, field: VisionClipCollectionOperationDetailField): boolean {
  if (field === 'title') return left.title === right.title
  if (field === 'tags') return sameTags(left.tags, right.tags)
  if (field === 'flags') return left.isFavorite === right.isFavorite && left.isArchived === right.isArchived
  if (field === 'sortMode') return left.sortMode === right.sortMode
  return left.selectionCount === right.selectionCount
}

function createFieldChanges(before: VisionClipCollectionOperationCollectionDetail | null, after: VisionClipCollectionOperationCollectionDetail | null): Record<VisionClipCollectionOperationDetailField, VisionClipCollectionOperationDetailChange> {
  const fieldChanges = {} as Record<VisionClipCollectionOperationDetailField, VisionClipCollectionOperationDetailChange>
  for (const field of VISION_CLIP_COLLECTION_OPERATION_DETAIL_FIELDS) {
    fieldChanges[field] = before === null ? 'added' : after === null ? 'removed' : sameField(before, after, field) ? 'unchanged' : 'changed'
  }
  return fieldChanges
}

export function diffVisionClipCollectionOperationDetails(before: readonly VisionClipCollectionOperationCollectionDetail[], after: readonly VisionClipCollectionOperationCollectionDetail[]): VisionClipCollectionOperationCollectionDiff[] {
  const beforeById = new Map(before.map((collection) => [collection.id, collection]))
  const afterById = new Map(after.map((collection) => [collection.id, collection]))
  const ids: string[] = []
  const seen = new Set<string>()
  for (const collection of [...before, ...after]) {
    if (seen.has(collection.id)) continue
    seen.add(collection.id)
    ids.push(collection.id)
  }
  return ids.map((id) => {
    const beforeCollection = beforeById.get(id) ?? null
    const afterCollection = afterById.get(id) ?? null
    return { id, before: beforeCollection, after: afterCollection, fieldChanges: createFieldChanges(beforeCollection, afterCollection) }
  })
}
