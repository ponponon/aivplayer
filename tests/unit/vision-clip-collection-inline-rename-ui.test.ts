import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection inline rename UI wiring', () => {
  it('supports enter save, escape cancel and empty-title feedback', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(panel).toContain('editingCollectionId')
    expect(panel).toContain('beginCollectionTitleEdit')
    expect(panel).toContain('cancelCollectionTitleEdit')
    expect(panel).toContain('saveCollectionTitle')
    expect(panel).toContain("event.key === 'Escape'")
    expect(panel).toContain("event.key === 'Enter'")
    expect(panel).toContain('collectionTitleRequired')
    expect(panel).toContain('title: patch.title ?? collection.title')
    expect(panel).toContain('maxLength={200}')
  })

  it('keeps inline edit controls compact and accessible', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

    expect(panel).toContain('vision-collection-title-row')
    expect(panel).toContain('vision-collection-inline-title-input')
    expect(panel).toContain('aria-label={app.copy.vision.collectionTitleEditLabel}')
    expect(panel).toContain('aria-label={app.copy.vision.saveCollectionTitle}')
    expect(panel).toContain('aria-label={app.copy.vision.cancelCollectionTitle}')
    expect(styles).toContain('.vision-collection-title-edit')
    expect(styles).toContain('.vision-collection-inline-action')
    expect(styles).toContain('min-width: 0')
  })
})
