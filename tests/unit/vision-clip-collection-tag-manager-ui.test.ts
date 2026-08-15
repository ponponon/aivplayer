import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()
const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
const styles = readFileSync(join(projectRoot, 'src/renderer/src/styles/player/vision-library-results.css'), 'utf8')

describe('vision clip collection tag manager UI wiring', () => {
  it('aggregates tags and invokes global cleanup with confirmation', () => {
    expect(panel).toContain('collectionTagStats')
    expect(panel).toContain('managedCollectionTag')
    expect(panel).toContain('cleanupCollectionTag')
    expect(panel).toContain('window.aiv.cleanupVisionClipCollectionTag({ tag })')
    expect(panel).toContain('collectionTagManagerSelectTag')
    expect(panel).toContain('collectionTagManagerConfirm')
  })

  it('supports global tag rename and keeps target input bounded', () => {
    expect(panel).toContain('collectionTagRenameTarget')
    expect(panel).toContain('normalizedCollectionTagRenameTarget')
    expect(panel).toContain('canRenameCollectionTag')
    expect(panel).toContain('renameCollectionTag')
    expect(panel).toContain('window.aiv.renameVisionClipCollectionTag({ fromTag, toTag })')
    expect(panel).toContain('collectionTagManagerRenameConfirm')
    expect(panel).toContain('collectionTagManagerRenameInputPlaceholder')
  })

  it('edits tag colors and parent metadata', () => {
    expect(panel).toContain('collectionTagMetadata')
    expect(panel).toContain('window.aiv.listVisionClipCollectionTagMetadata')
    expect(panel).toContain('window.aiv.updateVisionClipCollectionTagMetadata')
    expect(panel).toContain('collectionTagManagerMetadataParentLabel')
    expect(panel).toContain('type="color"')
    expect(panel).toContain('saveCollectionTagMetadata')
  })

  it('exposes the latest tag operation for undo', () => {
    expect(panel).toContain('lastCollectionTagOperation')
    expect(panel).toContain('window.aiv.getVisionClipCollectionTagOperationHistory')
    expect(panel).toContain('window.aiv.undoVisionClipCollectionTagOperation')
    expect(panel).toContain('undoCollectionTagOperation')
    expect(panel).toContain('collectionTagManagerUndoDescription')
  })

  it('keeps tag management accessible and responsive', () => {
    expect(panel).toContain('role="list"')
    expect(panel).toContain('aria-pressed={managedCollectionTag === item.tag}')
    expect(panel).toContain('vision-collection-tag-manager-item')
    expect(panel).toContain('vision-collection-tag-manager-input')
    expect(panel).toContain('vision-collection-tag-manager-metadata')
    expect(panel).toContain('vision-collection-tag-manager-undo')
    expect(styles).toContain('.vision-collection-tag-manager')
    expect(styles).toContain('.vision-collection-tag-manager-input')
    expect(styles).toContain('.vision-collection-tag-manager-metadata')
    expect(styles).toContain(".vision-collection-tag-manager-metadata-controls input[type='color']")
    expect(styles).toContain('.vision-collection-tag-manager-undo')
    expect(styles).toContain('flex-wrap: wrap')
    expect(styles).toContain(':focus-visible')
  })
})
