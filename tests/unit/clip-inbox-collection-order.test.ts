import { describe, expect, it } from 'vitest'
import type { VisionClipCollection } from '../../src/shared/vision-types'
import { normalizeVisionClipCollectionOrderPreferences, parseVisionClipCollectionOrderPreferences, serializeVisionClipCollectionOrderPreferences, sortVisionClipCollections } from '../../src/core/ai/clip-inbox-collection-order'

function collection(id: string, title: string, updatedAt: number, selections: Array<[number, number]>): VisionClipCollection {
  return {
    id,
    title,
    tags: [],
    sortMode: 'source-time',
    isFavorite: false,
    isArchived: false,
    createdAt: updatedAt - 1,
    updatedAt,
    selections: selections.map(([startSeconds, endSeconds], index) => ({
      id: `${id}-selection-${index}`,
      sourceId: 'source',
      videoPath: '/tmp/video.mp4',
      fileName: 'video.mp4',
      fingerprint: 'fingerprint',
      durationSeconds: 100,
      startSeconds,
      endSeconds,
      evidenceIds: [],
      evidenceTypes: []
    }))
  }
}

describe('clip inbox collection order', () => {
  const collections = [
    collection('c-1', 'Beta', 20, [[0, 4]]),
    collection('c-2', 'alpha', 30, [[0, 2], [4, 12]]),
    collection('c-3', 'Gamma', 10, [[0, 20]])
  ]

  it('sorts collections without mutating the source list', () => {
    expect(sortVisionClipCollections(collections, 'updated-desc').map((item) => item.id)).toEqual(['c-2', 'c-1', 'c-3'])
    expect(sortVisionClipCollections(collections, 'title-asc').map((item) => item.id)).toEqual(['c-2', 'c-1', 'c-3'])
    expect(sortVisionClipCollections(collections, 'selection-count-desc').map((item) => item.id)).toEqual(['c-2', 'c-1', 'c-3'])
    expect(sortVisionClipCollections(collections, 'duration-desc').map((item) => item.id)).toEqual(['c-3', 'c-2', 'c-1'])
    expect(collections.map((item) => item.id)).toEqual(['c-1', 'c-2', 'c-3'])
  })

  it('normalizes and persists the versioned preference', () => {
    expect(normalizeVisionClipCollectionOrderPreferences({ sortMode: 'duration-desc' })).toEqual({ schemaVersion: 1, sortMode: 'duration-desc' })
    expect(normalizeVisionClipCollectionOrderPreferences({ sortMode: 'unknown' })).toEqual({ schemaVersion: 1, sortMode: 'updated-desc' })
    const raw = serializeVisionClipCollectionOrderPreferences({ schemaVersion: 1, sortMode: 'title-asc' })
    expect(parseVisionClipCollectionOrderPreferences(raw)).toEqual({ schemaVersion: 1, sortMode: 'title-asc' })
    expect(parseVisionClipCollectionOrderPreferences('{invalid}')).toEqual({ schemaVersion: 1, sortMode: 'updated-desc' })
  })
})
