import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('vision custom entity smoke source', () => {
  it('covers creation, restart recovery, indexing, and entity search', async () => {
    const source = await readFile(new URL('../../scripts/smoke-vision-custom-entity.ts', import.meta.url), 'utf8')

    expect(source).toContain('`--user-data-dir=${userDataDirectory}`')
    expect(source).toContain("createForm.locator('button[type=\"submit\"]')")
    expect(source).toContain('await firstApp.close()')
    expect(source).toContain('Custom entity did not survive restart')
    expect(source).toContain('await utimes(mediaPath, changedMtime, changedMtime)')
    expect(source).toContain('vision-index-actions input[type="checkbox"]')
    expect(source).toContain('searchVisionText({ query, limit: 24, mode: \'hybrid\' })')
    expect(source).toContain("result.evidenceType === 'entity'")
    expect(source).toContain('progress.skippedVideos !== 0')
  })
})
