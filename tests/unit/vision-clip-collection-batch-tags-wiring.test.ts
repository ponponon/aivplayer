import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch tags wiring', () => {
  it('keeps one normalized tag update behind shared IPC, desktop and preload', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const store = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-store.ts'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_BATCH_TAGS: 'vision:clip-collection-batch-tags'")
    expect(channels).toContain("VISION_CLIP_COLLECTION_TAG_CLEANUP: 'vision:clip-collection-tag-cleanup'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_TAGS')
    expect(desktop).toContain('getClipInboxStore().updateCollectionsTags(collectionIds, tags, mode)')
    expect(desktop).toContain('normalizeVisionCollectionTags(request?.tags)')
    expect(desktop).toContain('normalizeVisionCollectionTagsMode(request?.mode)')
    expect(preload).toContain('updateVisionClipCollectionsTags')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_BATCH_TAGS')
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_CLEANUP')
    expect(desktop).toContain('getClipInboxStore().removeTagFromAllCollections(tag)')
    expect(preload).toContain('cleanupVisionClipCollectionTag')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_TAG_CLEANUP')
    expect(store).toContain('updateCollectionsTags(collectionIds: readonly string[], tags: unknown, mode: unknown = \'replace\')')
    expect(store).toContain('UPDATE clip_collections SET tags_json = ?, updated_at = ? WHERE id = ?')
  })
})
