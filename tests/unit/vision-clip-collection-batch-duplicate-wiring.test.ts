import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch duplicate wiring', () => {
  it('keeps one batch request behind the shared IPC and preload boundary', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_BATCH_DUPLICATE: 'vision:clip-collection-batch-duplicate'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DUPLICATE')
    expect(desktop).toContain('getClipInboxStore().duplicateCollections(request.collectionIds)')
    expect(preload).toContain('duplicateVisionClipCollections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DUPLICATE')
  })
})
