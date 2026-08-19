import { describe, expect, it } from 'vitest'
import type { VisionClipCollection } from '../../src/shared/vision-types'
import { summarizeVisionClipCollectionStatuses } from '../../src/core/ai/clip-inbox-collection-status'

function collection(id: string, isFavorite: boolean, isArchived: boolean): VisionClipCollection {
  return {
    id,
    title: id,
    tags: [],
    sortMode: 'source-time',
    isFavorite,
    isArchived,
    createdAt: 1,
    updatedAt: 1,
    selections: []
  }
}

describe('clip inbox collection status summary', () => {
  it('counts active, favorite, and archived collections independently', () => {
    expect(summarizeVisionClipCollectionStatuses([
      collection('active', false, false),
      collection('favorite', true, false),
      collection('archived', false, true),
      collection('favorite-archived', true, true)
    ])).toEqual({ allCount: 4, activeCount: 2, favoriteCount: 2, archivedCount: 2 })
  })

  it('returns zero counts for an empty collection list', () => {
    expect(summarizeVisionClipCollectionStatuses([])).toEqual({ allCount: 0, activeCount: 0, favoriteCount: 0, archivedCount: 0 })
  })
})
