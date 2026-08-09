import { describe, expect, it } from 'vitest'
import { filterMediaImportInboxItems } from '../../src/core/media/media-import-inbox-filter'
import type { MediaImportInboxItem } from '../../src/shared/media-import-inbox'

function item(overrides: Partial<MediaImportInboxItem>): MediaImportInboxItem {
  return {
    id: 'id',
    path: '/media/movie.mp4',
    fileName: 'movie.mp4',
    directoryPath: '/media',
    sizeBytes: 1,
    mtimeMs: 1,
    status: 'discovered',
    discoveredAt: 1,
    updatedAt: 1,
    metadata: { tags: [], favorite: false, note: '', source: null, projectId: null },
    pipeline: { metadata: 'pending', subtitle: 'pending', vision: 'pending' },
    ...overrides
  }
}

describe('media import inbox filter', () => {
  const items = [
    item({ id: 'one', fileName: 'Night City.mp4', metadata: { tags: ['城市'], favorite: true, note: '开场镜头', source: '拍摄', projectId: 'p1' } }),
    item({ id: 'two', fileName: 'Interview.mkv', status: 'failed', metadata: { tags: ['采访'], favorite: false, note: '待重试', source: null, projectId: 'p2' } })
  ]

  it('searches metadata and filters by status', () => {
    expect(filterMediaImportInboxItems(items, { query: '城市' }).map((next) => next.id)).toEqual(['one'])
    expect(filterMediaImportInboxItems(items, { status: 'failed' }).map((next) => next.id)).toEqual(['two'])
  })

  it('supports favorite-only filtering and keeps unrelated items out', () => {
    expect(filterMediaImportInboxItems(items, { favoriteOnly: true }).map((next) => next.id)).toEqual(['one'])
    expect(filterMediaImportInboxItems(items, { query: 'p2', favoriteOnly: true })).toEqual([])
  })
})
