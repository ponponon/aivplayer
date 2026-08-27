import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection tag update wiring', () => {
  it('keeps single tag edits behind shared IPC, desktop and preload', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')

    expect(channels).toContain("VISION_CLIP_COLLECTION_TAGS_UPDATE: 'vision:clip-collection-tags-update'")
    expect(desktop).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_TAGS_UPDATE')
    expect(desktop).toContain('getClipInboxStore().updateCollectionTags(request.collectionId, request.tags)')
    expect(preload).toContain('updateVisionClipCollectionTags')
    expect(preload).toContain('IPC_CHANNELS.VISION_CLIP_COLLECTION_TAGS_UPDATE')

    const start = panel.indexOf('const saveCollectionTags = async')
    const end = panel.indexOf('  const handleCollectionTagsKeyDown', start)
    expect(start).toBeGreaterThanOrEqual(0)
    expect(end).toBeGreaterThan(start)
    expect(panel.slice(start, end)).toContain('updateVisionClipCollectionTags')
    expect(panel.slice(start, end)).toContain('refreshCollectionTagOperation()')
    expect(panel).toContain('value="single"')
  })
})
