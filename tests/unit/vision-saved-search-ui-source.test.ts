import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision saved search UI', () => {
  it('keeps local saved search actions visible in the panel and styles', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-search.css'), 'utf8')

    expect(panel).toContain('listVisionSavedSearches')
    expect(panel).toContain('saveVisionSavedSearch')
    expect(panel).toContain('deleteVisionSavedSearch')
    expect(panel).toContain('runSavedSearch')
    expect(panel).toContain('vision-saved-searches')
    expect(panel).toContain('vision-saved-search-delete')
    expect(styles).toContain('.vision-saved-search-toolbar')
    expect(styles).toContain('.vision-saved-search-button:hover:not(:disabled)')
    expect(styles).toContain('.vision-saved-search-delete:hover')
  })
})
