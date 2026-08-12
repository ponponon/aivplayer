import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('vision saved search smoke source', () => {
  it('covers UI save, rerun, and restart persistence', async () => {
    const source = await readFile(new URL('../../scripts/smoke-vision-saved-search.ts', import.meta.url), 'utf8')

    expect(source).toContain("getByRole('button', { name: '保存搜索' })")
    expect(source).toContain('listVisionSavedSearches')
    expect(source).toContain('vision-saved-search-button')
    expect(source).toContain('did not survive restart')
    expect(source).toContain('firstSession.errors')
    expect(source).toContain('terminal?.status')
  })
})
