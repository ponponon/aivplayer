import { describe, expect, it } from 'vitest'
import { mergeVisionClipCollectionFilterTags, normalizeVisionClipCollectionFilterPreferences, parseVisionClipCollectionFilterPreferences, serializeVisionClipCollectionFilterPreferences } from '../../src/core/ai/clip-inbox-filter-preferences'

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
})
