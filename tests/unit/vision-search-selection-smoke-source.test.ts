import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('vision search selection smoke source', () => {
  it('covers current-result select all, clear, and re-search reset', async () => {
    const source = await readFile(new URL('../../scripts/smoke-vision-search-selection.ts', import.meta.url), 'utf8')

    expect(source).toContain('全选当前结果')
    expect(source).toContain('清空当前选择')
    expect(source).toContain('checkedResultCount')
    expect(source).toContain('clearedOnResearch')
    expect(source).toContain('session.errors')
    expect(source).toContain('disabled === true')
  })
})
