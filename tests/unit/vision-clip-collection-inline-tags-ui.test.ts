import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection inline tags UI wiring', () => {
  it('supports normalized tag save, escape cancel and clearing tags', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(panel).toContain('editingCollectionTagsId')
    expect(panel).toContain('beginCollectionTagsEdit')
    expect(panel).toContain('cancelCollectionTagsEdit')
    expect(panel).toContain('saveCollectionTags')
    expect(panel).toContain('normalizeVisionCollectionTags(editingCollectionTags)')
    expect(panel).toContain("event.key === 'Escape'")
    expect(panel).toContain("event.key === 'Enter'")
    expect(panel).toContain('maxLength={800}')
  })

  it('keeps tag editing bounded and accessible', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

    expect(panel).toContain('vision-collection-tags-row')
    expect(panel).toContain('vision-collection-inline-tags-input')
    expect(panel).toContain('aria-label={app.copy.vision.collectionTagsEditLabel}')
    expect(panel).toContain('aria-label={app.copy.vision.saveCollectionTags}')
    expect(panel).toContain('aria-label={app.copy.vision.cancelCollectionTags}')
    expect(styles).toContain('.vision-collection-tags-edit')
    expect(styles).toContain('.vision-collection-tags-empty')
    expect(styles).toContain('min-width: 0')
  })
})
