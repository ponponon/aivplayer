import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection import UI', () => {
  it('exposes two-stage import preview beside saved collections', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('importVisionClipCollectionPreview')
    expect(panel).toContain('applyVisionClipCollectionImport')
    expect(panel).toContain('collectionImport')
    expect(panel).toContain('collectionImportPreviewTitle')
    expect(panel).toContain('collectionImportDecisions')
    expect(panel).toContain('collectionImportOverwrite')
    expect(panel).toContain('collectionImportKeepLocal')
    expect(panel).toContain('collectionImportCancel')
    expect(panel).toContain('isTransferringCollectionImport')
    expect(panel).toContain('refreshCollectionOperation()')
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

  it('exposes confirmed batch collection deletion with one preload request', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('deleteVisionClipCollections')
    expect(panel).toContain('collectionsDeleteConfirm')
    expect(panel).toContain('deleteSelectedCollections')
    expect(panel).toContain('isDeletingCollections')
    expect(panel).toContain('vision-collection-batch-delete')
  })

  it('exposes batch rename inputs, preview and one preload request', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('renameVisionClipCollections')
    expect(panel).toContain('collectionRenamePrefix')
    expect(panel).toContain('collectionRenameSuffix')
    expect(panel).toContain('renamePreviewCollections')
    expect(panel).toContain('collectionsRenameConfirm')
    expect(panel).toContain('isRenamingCollections')
  })
})
