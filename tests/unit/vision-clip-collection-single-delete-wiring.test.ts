import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection single delete wiring', () => {
  it('refreshes collection history after a single deletion', () => {
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(desktop).toContain('getClipInboxStore().deleteCollection(collectionId.trim())')
    expect(preload).toContain('deleteVisionClipCollection')
    const start = panel.indexOf('const deleteCollection = (collection: VisionClipCollection)')
    const end = panel.indexOf('  const progressLabel', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    const handler = panel.slice(start, end)
    expect(handler).toContain('deleteVisionClipCollection(collection.id)')
    expect(handler).toContain('refreshCollectionOperation()')
    expect(handler).toContain('setSelectedCollectionIds')
    expect(handler).toContain('collectionsDeleted(1, 0)')
    expect(handler).toContain('setIsDeletingCollections(true)')
  })
})
