import { describe, expect, it } from 'vitest'
import { VisionSearchCursorStore } from '../../src/core/ai/vision-search-cursor'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function result(id: string): VisionSearchResult {
  return {
    id,
    videoPath: `/videos/${id}.mp4`,
    fileName: `${id}.mp4`,
    timestampSeconds: 1,
    thumbnailPath: `/tmp/${id}.jpg`,
    score: 0.9,
    modelId: 'test-model',
    modelVariant: 'test-variant'
  }
}

describe('vision search cursor store', () => {
  it('keeps a bounded, stable result snapshot while expanding the prefix', () => {
    let now = 100
    const store = new VisionSearchCursorStore({ now: () => now, createToken: () => 'cursor-1' })
    const first = store.createPage('text', [result('one'), result('two'), result('three')], 2)

    expect(first).toMatchObject({ results: [result('one'), result('two')], total: 3, limit: 2, offset: 0, hasMore: true, cursor: 'cursor-1' })
    now = 200
    const expanded = store.readPage('text', first.cursor as string, 3)
    expect(expanded.results.map((item) => item.id)).toEqual(['one', 'two', 'three'])
    expect(expanded.hasMore).toBe(false)
    expect(expanded.cursor).toBeUndefined()
  })

  it('rejects a cursor from another search kind or an expired snapshot', () => {
    let now = 0
    const store = new VisionSearchCursorStore({ now: () => now, ttlMs: 10, createToken: () => 'cursor-1' })
    const first = store.createPage('image', [result('one'), result('two')], 1)

    expect(() => store.readPage('text', first.cursor as string, 2)).toThrow('过期或无效')
    now = 10
    expect(() => store.readPage('image', first.cursor as string, 2)).toThrow('过期或无效')
  })

  it('evicts the least recently used snapshot when the count is bounded', () => {
    let now = 0
    let token = 0
    const store = new VisionSearchCursorStore({ now: () => now, maxCount: 2, createToken: () => `cursor-${++token}` })
    const first = store.createPage('text', [result('one'), result('two')], 1)
    now = 1
    const second = store.createPage('text', [result('three'), result('four')], 1)
    now = 2
    store.readPage('text', first.cursor as string, 1)
    now = 3
    const third = store.createPage('text', [result('five'), result('six')], 1)

    expect(() => store.readPage('text', second.cursor as string, 1)).toThrow('过期或无效')
    expect(store.readPage('text', first.cursor as string, 2).results).toHaveLength(2)
    expect(store.readPage('text', third.cursor as string, 2).results).toHaveLength(2)
  })
})
