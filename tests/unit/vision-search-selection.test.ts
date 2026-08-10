import { describe, expect, it } from 'vitest'
import { getVisionSearchSelectionState, getVisionSearchResultIds, toggleVisionSearchResultPageSelection } from '../../src/core/ai/vision-search-selection'
import type { VisionSearchResult } from '../../src/shared/vision-types'

const result = (id: string): VisionSearchResult => ({
  id,
  videoPath: `/tmp/${id}.mp4`,
  fileName: `${id}.mp4`,
  timestampSeconds: 1,
  thumbnailPath: '',
  score: 1,
  modelId: 'test',
  modelVariant: 'test'
})

describe('vision search selection', () => {
  it('deduplicates result ids and reports empty, partial and all states', () => {
    const results = [result('one'), result('two'), result('one')]
    expect(getVisionSearchResultIds(results)).toEqual(['one', 'two'])
    expect(getVisionSearchSelectionState(results, new Set())).toBe('empty')
    expect(getVisionSearchSelectionState(results, new Set(['one']))).toBe('partial')
    expect(getVisionSearchSelectionState(results, new Set(['one', 'two']))).toBe('all')
  })

  it('selects or clears only the current result page', () => {
    const results = [result('one'), result('two')]
    expect([...toggleVisionSearchResultPageSelection(results, new Set(['outside']))].sort()).toEqual(['one', 'outside', 'two'])
    expect([...toggleVisionSearchResultPageSelection(results, new Set(['one', 'two', 'outside']))].sort()).toEqual(['outside'])
  })
})
