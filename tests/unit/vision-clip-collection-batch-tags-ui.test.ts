import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

describe('vision clip collection batch tags UI wiring', () => {
  it('normalizes one tag set for selected collections and allows clearing', () => {
    expect(panel).toContain('collectionBatchTags')
    expect(panel).toContain('collectionBatchTagsMode')
    expect(panel).toContain('normalizeVisionCollectionTags(collectionBatchTags)')
    expect(panel).toContain('updateSelectedCollectionsTags')
    expect(panel).toContain('window.aiv.updateVisionClipCollectionsTags({ collectionIds, tags, mode })')
    expect(panel).toContain('value={collectionBatchTagsMode}')
    expect(panel).toContain('value="add"')
    expect(panel).toContain('value="remove"')
    expect(panel).toContain('collectionTagsBatchEmpty')
    expect(panel).toContain('setCollectionBatchTags(\'\')')
  })

  it('keeps batch tag controls accessible and bounded', () => {
    expect(panel).toContain('vision-collection-batch-tags-input')
    expect(panel).toContain('aria-label={app.copy.vision.collectionTagsBatchModeAriaLabel}')
    expect(panel).toContain('aria-label={app.copy.vision.collectionTagsBatchInputPlaceholder}')
    expect(panel).toContain('app.copy.vision.updateSelectedCollectionTags')
    expect(styles).toContain('.vision-collection-batch-tags-actions')
    expect(styles).toContain('.vision-collection-batch-tags-controls')
    expect(styles).toContain('.vision-collection-batch-tags-input')
    expect(styles).toContain('.vision-collection-batch-tags-mode')
    expect(styles).toContain('.vision-collection-batch-tags-hint')
    expect(styles).toContain('flex-wrap: wrap')
  })
})
