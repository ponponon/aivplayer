import { mergeVisionClipSelections } from './vision-evidence'
import { normalizeVisionCollectionSortMode, normalizeVisionCollectionTags, sortVisionClipSelections } from './clip-inbox-operations'
import type { VisionClipCollection, VisionClipCollectionImportPreviewItem, VisionClipCollectionInput } from '../../shared/vision-types'

function normalizedSelectionSignature(selection: VisionClipCollection['selections'][number]): Record<string, unknown> {
  return {
    sourceId: selection.sourceId,
    videoPath: selection.videoPath,
    fileName: selection.fileName,
    fingerprint: selection.fingerprint,
    durationSeconds: selection.durationSeconds,
    width: selection.width ?? null,
    height: selection.height ?? null,
    startSeconds: selection.startSeconds,
    endSeconds: selection.endSeconds,
    evidenceIds: [...selection.evidenceIds],
    text: selection.text ?? null,
    evidenceTypes: [...selection.evidenceTypes]
  }
}

function collectionSignature(collection: VisionClipCollectionInput | VisionClipCollection): string {
  const sortMode = normalizeVisionCollectionSortMode(collection.sortMode)
  const selections = sortVisionClipSelections(mergeVisionClipSelections(collection.selections), sortMode)
  return JSON.stringify({
    title: collection.title.trim(),
    tags: normalizeVisionCollectionTags(collection.tags),
    sortMode,
    isFavorite: collection.isFavorite === true,
    isArchived: collection.isArchived === true,
    selections: selections.map(normalizedSelectionSignature)
  })
}

function collectionTitle(collection: VisionClipCollectionInput | VisionClipCollection): string {
  return collection.title.trim()
}

/** Classifies imported collections before any local collection is changed. */
export function createVisionClipCollectionImportPreview(
  incoming: readonly VisionClipCollectionInput[],
  current: readonly VisionClipCollection[],
  availableSourcePaths?: ReadonlySet<string>
): VisionClipCollectionImportPreviewItem[] {
  const currentByTitle = new Map<string, VisionClipCollection>()
  for (const collection of current) {
    const title = collectionTitle(collection)
    if (title && !currentByTitle.has(title)) currentByTitle.set(title, collection)
  }
  return incoming.map((collection, incomingIndex) => {
    const title = collectionTitle(collection)
    const currentCollection = currentByTitle.get(title) ?? null
    const state = currentCollection === null
      ? 'new'
      : collectionSignature(collection) === collectionSignature(currentCollection)
        ? 'duplicate'
        : 'conflict'
    const sourcePaths = new Set(collection.selections.map((selection) => selection.videoPath.trim()).filter(Boolean))
    return {
      incomingIndex,
      title,
      tags: normalizeVisionCollectionTags(collection.tags),
      sortMode: normalizeVisionCollectionSortMode(collection.sortMode),
      isFavorite: collection.isFavorite === true,
      isArchived: collection.isArchived === true,
      selectionCount: collection.selections.length,
      currentCollectionId: currentCollection?.id ?? null,
      currentTitle: currentCollection?.title ?? null,
      currentSelectionCount: currentCollection?.selections.length ?? null,
      missingSourceCount: availableSourcePaths ? [...sourcePaths].filter((path) => !availableSourcePaths.has(path)).length : 0,
      state
    }
  })
}
