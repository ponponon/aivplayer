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
    expect(panel).toContain('exportVisionSavedSearches')
    expect(panel).toContain('importVisionSavedSearches')
    expect(panel).toContain('runSavedSearch')
    expect(panel).toContain('evidenceTypeFilter')
    expect(panel).toContain('evidenceTypes: filter')
    expect(panel).toContain('toggleEvidenceTypeFilter')
    expect(panel).toContain('formatEvidenceTypeFilter')
    expect(panel).toContain('searchPreferences')
    expect(panel).toContain('VISION_SEARCH_PREFERENCES_STORAGE_KEY')
    expect(panel).toContain('onSortModeChange')
    expect(panel).toContain('vision-saved-searches')
    expect(panel).toContain('vision-saved-search-actions')
    expect(panel).toContain('vision-saved-search-status')
    expect(panel).toContain('vision-saved-search-delete')
    expect(styles).toContain('.vision-saved-search-toolbar')
    expect(styles).toContain('.vision-saved-search-heading-row')
    expect(styles).toContain('.vision-saved-search-actions')
    expect(styles).toContain('.vision-saved-search-button:hover:not(:disabled)')
    expect(styles).toContain('.vision-saved-search-delete:hover')
    expect(styles).toContain('.vision-evidence-filter-options')
    expect(styles).toContain('.vision-evidence-filter-option:has(input:checked)')
    expect(readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')).toContain('.vision-results-toolbar')
    expect(readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')).toContain('.vision-results-selection-action')
    expect(readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')).toContain('.vision-results-load-more')
    expect(readFileSync(join(projectRoot, 'src/renderer/src/app/vision-search-results.tsx'), 'utf8')).toContain('onLoadMoreResults')
  })
})
