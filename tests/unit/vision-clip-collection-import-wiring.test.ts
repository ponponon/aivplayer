import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection import wiring', () => {
  it('keeps direct import and two-stage preview channels connected', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    expect(channels).toContain('VISION_CLIP_COLLECTION_IMPORT')
    expect(channels).toContain('VISION_CLIP_COLLECTION_IMPORT_PREVIEW')
    expect(channels).toContain('VISION_CLIP_COLLECTION_IMPORT_APPLY')
    expect(desktop).toContain('parseVisionClipCollectionImportFile')
    expect(desktop).toContain('createVisionClipCollectionImportPreview')
    expect(desktop).toContain('getAvailableCollectionImportSourcePaths')
    expect(desktop).toContain('await stat(path)')
    expect(desktop).toContain('getClipInboxStore().importCollection')
    expect(desktop).toContain('store.importCollectionsWithHistory')
    expect(preload).toContain('importVisionClipCollection')
    expect(preload).toContain('importVisionClipCollectionPreview')
    expect(preload).toContain('applyVisionClipCollectionImport')
  })
})
