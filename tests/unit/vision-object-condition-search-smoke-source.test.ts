import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('vision object condition search smoke source', () => {
  it('covers saved object label, category, and score conditions against full-library results', async () => {
    const source = await readFile(new URL('../../scripts/smoke-vision-object-condition-search.ts', import.meta.url), 'utf8')

    expect(source).toContain('object-condition-person-high')
    expect(source).toContain("labelQuery: 'person'")
    expect(source).toContain('minimumScore: 0.8')
    expect(source).toContain("categoryLabels: ['person']")
    expect(source).toContain('searchVisionText')
    expect(source).toContain('visibleRows !== 1')
  })
})
