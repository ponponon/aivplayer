import { describe, expect, it } from 'vitest'
import type { VisionSearchResult } from '../../src/shared/vision-types'
import { sortVisionSearchResults } from '../../src/core/ai/vision-search'
import { normalizeVisionSearchPreferences, parseVisionSearchPreferences, serializeVisionSearchPreferences } from '../../src/core/ai/vision-search-preferences'

function result(id: string, fileName: string, videoPath: string, timestampSeconds: number, score: number): VisionSearchResult {
  return { id, fileName, videoPath, timestampSeconds, thumbnailPath: '', score, modelId: 'test', modelVariant: 'test' }
}

describe('vision search preferences', () => {
  it('normalizes the sort mode and evidence types into a stable contract', () => {
    expect(normalizeVisionSearchPreferences({ sortMode: 'file-name', evidenceTypes: ['speaker', 'ocr', 'ocr', 'invalid'] })).toEqual({
      schemaVersion: 1,
      sortMode: 'file-name',
      evidenceTypes: ['ocr', 'speaker']
    })
    expect(parseVisionSearchPreferences('{invalid')).toEqual({ schemaVersion: 1, sortMode: 'relevance', evidenceTypes: [] })
    expect(parseVisionSearchPreferences(null).sortMode).toBe('relevance')
    expect(JSON.parse(serializeVisionSearchPreferences({ schemaVersion: 1, sortMode: 'source-time', evidenceTypes: ['visual'] }))).toEqual({
      schemaVersion: 1,
      sortMode: 'source-time',
      evidenceTypes: ['visual']
    })
  })

  it('sorts relevance, source time, and file name without mutating the input', () => {
    const results = [
      result('b', 'zeta.mp4', '/media/zeta.mp4', 12, 0.7),
      result('a', 'alpha.mp4', '/media/alpha.mp4', 20, 0.7),
      result('c', 'alpha.mp4', '/media/alpha.mp4', 3, 0.9)
    ]

    expect(sortVisionSearchResults(results, 'relevance').map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(sortVisionSearchResults(results, 'source-time').map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(sortVisionSearchResults(results, 'file-name').map((item) => item.id)).toEqual(['c', 'a', 'b'])
    expect(results.map((item) => item.id)).toEqual(['b', 'a', 'c'])
  })
})
