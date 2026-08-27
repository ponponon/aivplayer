import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch delete wiring', () => {
  it('keeps one destructive batch request behind shared IPC, desktop and preload', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const store = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-store.ts'), 'utf8')
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_BATCH_DELETE: 'vision:clip-collection-batch-delete'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DELETE')
    expect(desktop).toContain('getClipInboxStore().deleteCollections(request.collectionIds)')
    expect(preload).toContain('deleteVisionClipCollections')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_DELETE')
    expect(store).toContain("recordCollectionOperation('delete'")
    expect(panel).toContain('refreshCollectionOperation()')
  })
})
