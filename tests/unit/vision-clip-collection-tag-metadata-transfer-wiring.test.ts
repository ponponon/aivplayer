import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection tag metadata transfer wiring', () => {
  it('keeps versioned tag metadata import and export behind desktop and preload', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const transfer = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-tag-transfer.ts'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT: 'vision:clip-collection-tag-metadata-export'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT: 'vision:clip-collection-tag-metadata-import'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT_APPLY: 'vision:clip-collection-tag-metadata-import-apply'")
    expect(desktop).toContain('renderVisionClipCollectionTagMetadataExport(metadata)')
    expect(desktop).toContain('parseVisionClipCollectionTagMetadataImportText')
    expect(desktop).toContain('getClipInboxStore().importTagMetadata(selected)')
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_METADATA_IMPORT_APPLY')
    expect(desktop).toContain('filterVisionClipCollectionTagMetadataImport')
    expect(preload).toContain('exportVisionClipCollectionTagMetadata')
    expect(preload).toContain('importVisionClipCollectionTagMetadata')
    expect(preload).toContain('applyVisionClipCollectionTagMetadata')
    expect(transfer).toContain('VISION_CLIP_COLLECTION_TAG_METADATA_EXPORT_VERSION = 1')
  })
})
