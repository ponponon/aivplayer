import type { VisionClipCollection } from '../../shared/vision-types'

export type VisionClipCollectionStatusSummary = {
  allCount: number
  activeCount: number
  favoriteCount: number
  archivedCount: number
}

export function summarizeVisionClipCollectionStatuses(collections: readonly VisionClipCollection[]): VisionClipCollectionStatusSummary {
  return collections.reduce<VisionClipCollectionStatusSummary>((summary, collection) => {
    summary.allCount += 1
    if (collection.isArchived) summary.archivedCount += 1
    else summary.activeCount += 1
    if (collection.isFavorite) summary.favoriteCount += 1
    return summary
  }, { allCount: 0, activeCount: 0, favoriteCount: 0, archivedCount: 0 })
}
