import { describe, expect, it } from 'vitest'
import { mergeVisionClipCollectionFilterTags, normalizeVisionClipCollectionFilterPreferences, normalizeVisionClipCollectionSavedFilters, parseVisionClipCollectionFilterPreferences, parseVisionClipCollectionSavedFilters, removeVisionClipCollectionSavedFilter, serializeVisionClipCollectionFilterPreferences, serializeVisionClipCollectionSavedFilters, upsertVisionClipCollectionSavedFilter } from '../../src/core/ai/clip-inbox-filter-preferences'

describe('clip inbox filter preferences', () => {
  it('normalizes query, tags and match mode', () => {
    expect(normalizeVisionClipCollectionFilterPreferences({ query: `  海边  `, tags: [' 采访 ', '采访', '', '精选'], tagMode: 'all' })).toEqual({ schemaVersion: 1, query: '海边', tags: ['采访', '精选'], tagMode: 'all' })
    expect(normalizeVisionClipCollectionFilterPreferences({ query: 'x'.repeat(240), tags: ['x'.repeat(60)], tagMode: 'invalid' })).toEqual({ schemaVersion: 1, query: 'x'.repeat(200), tags: ['x'.repeat(40)], tagMode: 'any' })
  })

  it('round trips valid preferences and rejects malformed JSON', () => {
    const preferences = { schemaVersion: 1 as const, query: '海边', tags: ['采访'], tagMode: 'any' as const }
    expect(parseVisionClipCollectionFilterPreferences(serializeVisionClipCollectionFilterPreferences(preferences))).toEqual(preferences)
    expect(parseVisionClipCollectionFilterPreferences('{invalid}')).toEqual({ schemaVersion: 1, query: '', tags: [], tagMode: 'any' })
  })

  it('removes saved tags that are no longer active', () => {
    expect(mergeVisionClipCollectionFilterTags(['采访', '旧标签', '采访'], ['采访', '精选'])).toEqual(['采访'])
    expect(mergeVisionClipCollectionFilterTags(['采访'], [])).toEqual([])
  })

  it('normalizes, round trips and deduplicates saved filters', () => {
    const saved = normalizeVisionClipCollectionSavedFilters([
      { id: ' coastal ', name: ' 海边素材 ', query: ' 海边 ', tags: ['采访', '采访'], tagMode: 'all', createdAt: 10, updatedAt: 5 },
      { id: 'coastal', name: '重复项', query: 'ignored', tags: [], tagMode: 'any', createdAt: 20, updatedAt: 20 },
      { id: '', name: '无效项' }
    ])
    expect(saved).toEqual([{ schemaVersion: 1, id: 'coastal', name: '海边素材', query: '海边', tags: ['采访'], tagMode: 'all', createdAt: 10, updatedAt: 10 }])
    expect(parseVisionClipCollectionSavedFilters(serializeVisionClipCollectionSavedFilters(saved))).toEqual(saved)
    expect(parseVisionClipCollectionSavedFilters('{invalid}')).toEqual([])
    expect(parseVisionClipCollectionSavedFilters(JSON.stringify({ schemaVersion: 2, filters: saved }))).toEqual([])
  })

  it('upserts newest saved filters, caps the list and removes by id', () => {
    const current = normalizeVisionClipCollectionSavedFilters(Array.from({ length: 20 }, (_, index) => ({ id: `filter-${index}`, name: `筛选 ${index}`, query: '', tags: [], tagMode: 'any', createdAt: index, updatedAt: index })))
    const updated = upsertVisionClipCollectionSavedFilter(current, { id: 'filter-3', name: '更新后的筛选', query: '海边', tags: ['精选'], tagMode: 'all', createdAt: 3, updatedAt: 30 })
    expect(updated[0]).toMatchObject({ id: 'filter-3', name: '更新后的筛选', query: '海边', updatedAt: 30 })
    expect(updated).toHaveLength(20)
    const inserted = upsertVisionClipCollectionSavedFilter(updated, { id: 'new-filter', name: '新筛选', query: '', tags: [], tagMode: 'any', createdAt: 40, updatedAt: 40 })
    expect(inserted[0].id).toBe('new-filter')
    expect(inserted).toHaveLength(20)
    expect(inserted.some((item) => item.id === 'filter-19')).toBe(false)
    expect(removeVisionClipCollectionSavedFilter(inserted, 'new-filter').some((item) => item.id === 'new-filter')).toBe(false)
  })
})
