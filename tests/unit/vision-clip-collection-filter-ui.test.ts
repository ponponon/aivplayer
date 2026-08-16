import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

describe('vision clip collection filter UI wiring', () => {
  it('matches collection titles and tags locally without persistence wiring', () => {
    expect(panel).toContain('collectionFilterQueryLower')
    expect(panel).toContain('collectionFilterTag')
    expect(panel).toContain('collectionFilterTags')
    expect(panel).toContain('isVisionCollectionTagDescendantOrSelf')
    expect(panel).toContain('getVisionCollectionTagPath(tag, collectionTagMetadata)')
    expect(panel).toContain('visibleCollections')
    expect(panel).toContain('collection.title, ...collection.tags')
    expect(panel).toContain('setCollectionFilterQuery(\'\')')
    expect(panel).toContain('setCollectionFilterTag(\'\')')
    expect(panel).toContain('collectionFilterEmpty')
  })

  it('keeps filter controls accessible and responsive', () => {
    expect(panel).toContain('value={collectionFilterQuery}')
    expect(panel).toContain('aria-label={app.copy.vision.collectionFilterPlaceholder}')
    expect(panel).toContain('aria-label={app.copy.vision.collectionFilterTagLabel}')
    expect(panel).toContain('className="vision-collection-filter-summary" role="status"')
    expect(styles).toContain('.vision-collection-filter-bar')
    expect(styles).toContain('flex-wrap: wrap')
    expect(styles).toContain('.vision-collection-filter-input')
    expect(styles).toContain('.vision-collection-filter-tag')
  })
})
