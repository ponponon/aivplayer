import { describe, expect, it } from 'vitest'
import type { WebShareMediaItem } from '../../src/shared/web-types'
import { applyWebLibraryUrlPreferences, buildWebLibraryTree, createDefaultWebLibraryPreferences, filterWebLibraryItems, getHistoryEntry, getWebLibraryBreadcrumbs, isInProgress, sortWebLibraryItems } from '../../src/web/library-state'

function createItem(overrides: Partial<WebShareMediaItem>): WebShareMediaItem {
  return {
    id: 'one', name: 'one.mp4', extension: '.mp4', mimeType: 'video/mp4', sizeBytes: 100, modifiedAt: 1,
    streamUrl: '/media/one', subtitleUrl: null, browserSupport: 'likely', transcodeUrl: '/api/v1/media/one/transcode', durationSeconds: 100, videoCodec: 'h264', audioCodec: 'aac',
    sourceKind: 'directory', sourceGroupId: 'movies', sourceGroupLabel: 'Movies', relativePath: 'one.mp4', thumbnailUrl: '/thumbnail/one', ...overrides
  }
}

describe('Web library state', () => {
  it('filters by group, favorites and resume state, then sorts by recent history', () => {
    const first = createItem({ id: 'first', name: 'first.mp4', relativePath: 'Movies/first.mp4', sizeBytes: 100 })
    const second = createItem({ id: 'second', name: 'second.mkv', relativePath: 'Movies/second.mkv', sizeBytes: 200, sourceGroupId: 'series', sourceGroupLabel: 'Series' })
    const preferences = createDefaultWebLibraryPreferences()
    preferences.favorites = ['second']
    preferences.history = { first: { position: 20, duration: 100, updatedAt: 200 }, second: { position: 30, duration: 100, updatedAt: 100 } }
    preferences.filter = 'in-progress'
    preferences.selectedGroupId = 'movies'
    preferences.sort = 'recent'

    expect(filterWebLibraryItems([second, first], '', preferences)).toEqual([first])
    expect(sortWebLibraryItems([second, first], preferences).map((item) => item.id)).toEqual(['first', 'second'])
    expect(isInProgress(first, preferences)).toBe(true)
    expect(getHistoryEntry(preferences, 'first')?.position).toBe(20)
  })

  it('treats a near-end position as watched instead of resumable', () => {
    const item = createItem({ id: 'finished' })
    const preferences = createDefaultWebLibraryPreferences()
    preferences.history.finished = { position: 95, duration: 100, updatedAt: 1 }
    expect(isInProgress(item, preferences)).toBe(false)
  })

  it('applies shareable URL state without losing local preferences', () => {
    const preferences = createDefaultWebLibraryPreferences()
    preferences.favorites = ['keep-me']
    const next = applyWebLibraryUrlPreferences(preferences, new URLSearchParams('sort=size-desc&filter=favorites&view=grid&group=movies%3A%3Aseason-1'))
    expect(next).toMatchObject({ sort: 'size-desc', filter: 'favorites', view: 'grid', selectedGroupId: 'movies::season-1', favorites: ['keep-me'] })
  })

  it('builds nested directory nodes and filters by a nested node', () => {
    const first = createItem({ id: 'first', relativePath: '电影/科幻/first.mp4' })
    const second = createItem({ id: 'second', relativePath: '电影/喜剧/second.mp4' })
    const tree = buildWebLibraryTree([first, second])
    const root = tree[0]!
    const movieFolder = root.children[0]!
    const sciFiFolder = movieFolder.children.find((node) => node.label === '科幻')!
    const preferences = createDefaultWebLibraryPreferences()
    preferences.selectedGroupId = sciFiFolder.id

    expect(root.itemCount).toBe(2)
    expect(movieFolder.kind).toBe('directory')
    expect(sciFiFolder.itemCount).toBe(1)
    expect(getWebLibraryBreadcrumbs(tree, sciFiFolder.id).map((node) => node.label)).toEqual(['Movies', '电影', '科幻'])
    expect(filterWebLibraryItems([first, second], '', preferences).map((item) => item.id)).toEqual(['first'])
  })
})
