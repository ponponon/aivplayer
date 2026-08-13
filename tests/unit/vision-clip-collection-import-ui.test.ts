import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection import UI', () => {
  it('exposes import beside saved collections and refreshes the collection view', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('importVisionClipCollection')
    expect(panel).toContain('collectionImport')
    expect(panel).toContain('const importedCollections = result.collections ?? (result.collection ? [result.collection] : [])')
    expect(panel).toContain('savedCollectionEmpty')
  })

  it('exposes one-click collection duplication and reports the new title', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('duplicateVisionClipCollection')
    expect(panel).toContain('duplicateCollection')
    expect(panel).toContain('collectionDuplicated(duplicate.title)')
    expect(panel).toContain('duplicatingCollectionId')
  })

  it('exposes batch collection selection and one request for selected copies', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('selectedCollectionIds')
    expect(panel).toContain('toggleAllCollectionSelection')
    expect(panel).toContain('duplicateVisionClipCollections')
    expect(panel).toContain('duplicateSelectedCollections')
    expect(panel).toContain('selectedCollections(selectedCollectionIds.size)')
  })

  it('exposes batch JSON export with a busy guard', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('exportVisionClipCollections')
    expect(panel).toContain('exportSelectedCollections')
    expect(panel).toContain('isExportingCollections')
    expect(panel).toContain('finally(() => setIsExportingCollections(false))')
  })
})
