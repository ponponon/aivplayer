import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch merge wiring', () => {
  it('keeps batch merge behind one shared IPC and preload request', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_BATCH_MERGE: 'vision:clip-collection-batch-merge'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_MERGE')
    expect(desktop).toContain('getClipInboxStore().mergeCollections(collectionIds, request?.title, request?.sortMode, request?.selectedSelections)')
    expect(desktop).toContain('selectedSelections')
    expect(preload).toContain('mergeVisionClipCollections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_MERGE')
  })
})
