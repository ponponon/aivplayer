import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('vision search pagination smoke source', () => {
  it('covers 24-result first page, load-more, and selection preservation', async () => {
    const source = await readFile(new URL('../../scripts/smoke-vision-search-pagination.ts', import.meta.url), 'utf8')

    expect(source).toContain("const fixtureCount = 30")
    expect(source).toContain("expected: 24")
    expect(source).toContain('vision-results-load-more')
    expect(source).toContain('selectedAfterLoadMore')
    expect(source).toContain('loadMoreHidden')
  })
})
