import { describe, expect, it } from 'vitest'
import { getNextVisionSearchLimit, shouldLoadMoreVisionSearchResults, VISION_SEARCH_MAX_RESULTS, VISION_SEARCH_PAGE_SIZE } from '../../src/core/ai/vision-search-pagination'

describe('vision search pagination', () => {
  it('grows result windows by one page without exceeding the hard cap', () => {
    expect(getNextVisionSearchLimit(VISION_SEARCH_PAGE_SIZE)).toBe(48)
    expect(getNextVisionSearchLimit(96)).toBe(VISION_SEARCH_MAX_RESULTS)
    expect(getNextVisionSearchLimit(VISION_SEARCH_MAX_RESULTS)).toBe(VISION_SEARCH_MAX_RESULTS)
  })

  it('only offers another window when the current one is full', () => {
    expect(shouldLoadMoreVisionSearchResults(24, 24)).toBe(true)
    expect(shouldLoadMoreVisionSearchResults(23, 24)).toBe(false)
    expect(shouldLoadMoreVisionSearchResults(100, 100)).toBe(false)
    expect(shouldLoadMoreVisionSearchResults(24, 24, 30)).toBe(true)
  })
})
