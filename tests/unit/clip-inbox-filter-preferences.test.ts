import { describe, expect, it } from 'vitest'
import { applyVisionClipCollectionSavedFilterImportPreview, createVisionClipCollectionSavedFilterImportPreview, mergeVisionClipCollectionFilterTags, mergeVisionClipCollectionSavedFilters, normalizeVisionClipCollectionFilterPreferences, normalizeVisionClipCollectionSavedFilters, parseVisionClipCollectionFilterPreferences, parseVisionClipCollectionSavedFilterManifest, parseVisionClipCollectionSavedFilters, removeVisionClipCollectionSavedFilter, serializeVisionClipCollectionFilterPreferences, serializeVisionClipCollectionSavedFilters, upsertVisionClipCollectionSavedFilter } from '../../src/core/ai/clip-inbox-filter-preferences'

describe('clip inbox filter preferences', () => {
  it('normalizes query, tags and match mode', () => {
    expect(normalizeVisionClipCollectionFilterPreferences({ query: `  海边  `, tags: [' 采访 ', '采访', '', '精选'], excludedTags: [' 室内 ', '室内'], tagMode: 'all', visibility: 'favorites' })).toEqual({ schemaVersion: 1, query: '海边', tags: ['采访', '精选'], excludedTags: ['室内'], tagMode: 'all', visibility: 'favorites' })
    expect(normalizeVisionClipCollectionFilterPreferences({ query: 'x'.repeat(240), tags: ['x'.repeat(60)], tagMode: 'invalid', visibility: 'unknown' })).toEqual({ schemaVersion: 1, query: 'x'.repeat(200), tags: ['x'.repeat(40)], excludedTags: [], tagMode: 'any', visibility: 'all' })
  })

  it('round trips valid preferences and rejects malformed JSON', () => {
    const preferences = { schemaVersion: 1 as const, query: '海边', tags: ['采访'], excludedTags: ['室内'], tagMode: 'any' as const, visibility: 'archived' as const }
    expect(parseVisionClipCollectionFilterPreferences(serializeVisionClipCollectionFilterPreferences(preferences))).toEqual(preferences)
    expect(parseVisionClipCollectionFilterPreferences('{invalid}')).toEqual({ schemaVersion: 1, query: '', tags: [], excludedTags: [], tagMode: 'any', visibility: 'all' })
  })

  it('removes saved tags that are no longer active', () => {
    expect(mergeVisionClipCollectionFilterTags(['采访', '旧标签', '采访'], ['采访', '精选'])).toEqual(['采访'])
    expect(mergeVisionClipCollectionFilterTags(['采访'], [])).toEqual([])
  })

  it('keeps excluded tags in saved view identity', () => {
    const current = normalizeVisionClipCollectionSavedFilters([{ id: 'include-only', name: '只看采访', query: '', tags: ['采访'], excludedTags: [], tagMode: 'any', createdAt: 1, updatedAt: 1 }])
    const result = mergeVisionClipCollectionSavedFilters(current, normalizeVisionClipCollectionSavedFilters([{ id: 'exclude-room', name: '排除室内', query: '', tags: ['采访'], excludedTags: ['室内'], tagMode: 'any', createdAt: 2, updatedAt: 2 }]))
    expect(result.importedCount).toBe(1)
    expect(result.filters[1].excludedTags).toEqual(['室内'])
  })

  it('keeps favorite and archive visibility in saved view identity', () => {
    const current = normalizeVisionClipCollectionSavedFilters([{ id: 'all', name: '全部集合', query: '', tags: [], excludedTags: [], tagMode: 'any', visibility: 'all', createdAt: 1, updatedAt: 1 }])
    const result = mergeVisionClipCollectionSavedFilters(current, normalizeVisionClipCollectionSavedFilters([{ id: 'favorites', name: '收藏集合', query: '', tags: [], excludedTags: [], tagMode: 'any', visibility: 'favorites', createdAt: 2, updatedAt: 2 }]))
    expect(result.importedCount).toBe(1)
    expect(result.filters[1].visibility).toBe('favorites')
  })

  it('normalizes, round trips and deduplicates saved filters', () => {
    const saved = normalizeVisionClipCollectionSavedFilters([
      { id: ' coastal ', name: ' 海边素材 ', query: ' 海边 ', tags: ['采访', '采访'], tagMode: 'all', createdAt: 10, updatedAt: 5 },
      { id: 'coastal', name: '重复项', query: 'ignored', tags: [], tagMode: 'any', createdAt: 20, updatedAt: 20 },
      { id: '', name: '无效项' }
    ])
    expect(saved).toEqual([{ schemaVersion: 1, id: 'coastal', name: '海边素材', query: '海边', tags: ['采访'], excludedTags: [], tagMode: 'all', visibility: 'all', createdAt: 10, updatedAt: 10 }])
    expect(parseVisionClipCollectionSavedFilters(serializeVisionClipCollectionSavedFilters(saved))).toEqual(saved)
    expect(parseVisionClipCollectionSavedFilters('{invalid}')).toEqual([])
    expect(parseVisionClipCollectionSavedFilters(JSON.stringify({ schemaVersion: 2, filters: saved }))).toEqual([])
    expect(parseVisionClipCollectionSavedFilterManifest(serializeVisionClipCollectionSavedFilters(saved))).toEqual(saved)
    expect(() => parseVisionClipCollectionSavedFilterManifest(JSON.stringify({ schemaVersion: 2, filters: saved }))).toThrow('格式无效')
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

  it('merges imported views with duplicate, id collision and capacity protection', () => {
    const current = normalizeVisionClipCollectionSavedFilters([{ id: 'same-id', name: '当前视图', query: '当前', tags: [], tagMode: 'any', createdAt: 1, updatedAt: 1 }])
    const result = mergeVisionClipCollectionSavedFilters(current, normalizeVisionClipCollectionSavedFilters([
      { id: 'same-id', name: '导入视图', query: '导入', tags: [], tagMode: 'any', createdAt: 2, updatedAt: 2 },
      { id: 'new-id', name: '重复条件', query: '当前', tags: [], tagMode: 'any', createdAt: 3, updatedAt: 3 },
      { id: 'other-id', name: '新视图', query: '新', tags: [], tagMode: 'any', createdAt: 4, updatedAt: 4 }
    ]))
    expect(result.importedCount).toBe(2)
    expect(result.skippedCount).toBe(1)
    expect(result.filters.map((filter) => filter.id)).toEqual(['same-id', 'same-id-import-1', 'other-id'])
  })

  it('previews new, unchanged, conflicting, duplicate and over-limit views', () => {
    const current = normalizeVisionClipCollectionSavedFilters([
      { id: 'same-id', name: '当前视图', query: '当前', tags: [], tagMode: 'any', createdAt: 1, updatedAt: 1 },
      { id: 'id-conflict', name: '编号视图', query: '编号', tags: [], tagMode: 'any', createdAt: 2, updatedAt: 2 }
    ])
    const imported = normalizeVisionClipCollectionSavedFilters([
      { id: 'same-id', name: '当前视图', query: '当前', tags: [], tagMode: 'any', createdAt: 1, updatedAt: 1 },
      { id: 'condition-conflict', name: '重命名视图', query: '当前', tags: [], tagMode: 'any', createdAt: 3, updatedAt: 3 },
      { id: 'id-conflict', name: '编号更新', query: '其他', tags: [], tagMode: 'any', createdAt: 4, updatedAt: 4 },
      { id: 'other-id', name: '新视图', query: '新', tags: [], tagMode: 'any', createdAt: 5, updatedAt: 5 },
      { id: 'duplicate-id', name: '重复条件', query: '新', tags: [], tagMode: 'any', createdAt: 6, updatedAt: 6 }
    ])
    expect(createVisionClipCollectionSavedFilterImportPreview(current, imported).map((item) => item.state)).toEqual(['unchanged', 'conflict', 'conflict', 'new', 'duplicate'])
    const full = normalizeVisionClipCollectionSavedFilters(Array.from({ length: 20 }, (_, index) => ({ id: `filter-${index}`, name: `筛选 ${index}`, query: `查询 ${index}`, tags: [], tagMode: 'any', createdAt: index, updatedAt: index })))
    expect(createVisionClipCollectionSavedFilterImportPreview(full, normalizeVisionClipCollectionSavedFilters([{ id: 'last-id', name: '超限', query: '超限', tags: [], tagMode: 'any', createdAt: 30, updatedAt: 30 }]))[0].state).toBe('over-limit')
  })

  it('applies only confirmed conflicts and reports imported or skipped views', () => {
    const current = normalizeVisionClipCollectionSavedFilters([{ id: 'same-id', name: '当前视图', query: '当前', tags: [], tagMode: 'any', createdAt: 1, updatedAt: 1 }])
    const imported = normalizeVisionClipCollectionSavedFilters([
      { id: 'same-id', name: '重命名视图', query: '其他', tags: [], tagMode: 'any', createdAt: 2, updatedAt: 2 },
      { id: 'new-id', name: '新视图', query: '新', tags: [], tagMode: 'any', createdAt: 3, updatedAt: 3 }
    ])
    const preview = createVisionClipCollectionSavedFilterImportPreview(current, imported)
    const result = applyVisionClipCollectionSavedFilterImportPreview(current, preview, { 'same-id': 'overwrite' })
    expect(result).toMatchObject({ importedCount: 2, skippedCount: 0 })
    expect(result.filters.map((filter) => filter.id)).toEqual(['same-id', 'new-id'])
    expect(result.filters.find((filter) => filter.id === 'same-id')?.name).toBe('重命名视图')
  })
})
