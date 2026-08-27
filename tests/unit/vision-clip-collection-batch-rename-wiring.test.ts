import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch rename wiring', () => {
  it('keeps prefix and suffix renaming behind shared IPC, desktop and preload', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const store = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-store.ts'), 'utf8')
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_BATCH_RENAME: 'vision:clip-collection-batch-rename'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_RENAME')
    expect(desktop).toContain('getClipInboxStore().renameCollections(collectionIds, prefix, suffix)')
    expect(preload).toContain('renameVisionClipCollections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_RENAME')
    expect(store).toContain("recordCollectionOperation('rename'")
    expect(panel).toContain('refreshCollectionOperation()')
  })
})
