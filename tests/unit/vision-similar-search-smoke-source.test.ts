import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('vision similar search smoke source', () => {
  it('covers indexing, IPC similarity search, grouped UI, and restoration', async () => {
    const source = await readFile(new URL('../../scripts/smoke-vision-similar-search.ts', import.meta.url), 'utf8')

    expect(source).toContain("'-loop', '1'")
    expect(source).toContain('window.aiv.searchVisionSimilar')
    expect(source).toContain(".vision-result-similar-action")
    expect(source).toContain('vision-similar-return')
    expect(source).toContain('vision-similar-group')
    expect(source).toContain('indexedFrameCount < 3')
    expect(source).toContain('session.errors.length')
  })
})
