import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch export IPC wiring', () => {
  it('keeps batch export and multi-import behind the desktop and preload boundary', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_BATCH_EXPORT: 'vision:clip-collection-batch-export'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_EXPORT')
    expect(desktop).toContain('renderVisionClipCollectionsExport(collections)')
    expect(desktop).toContain('parseVisionClipCollectionsImport(parsed)')
    expect(preload).toContain('exportVisionClipCollections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_EXPORT')
  })
})
