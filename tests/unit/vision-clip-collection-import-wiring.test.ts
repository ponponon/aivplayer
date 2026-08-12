import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection import wiring', () => {
  it('keeps the import channel connected across desktop, preload, and parser layers', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const desktop = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')
    expect(channels).toContain('VISION_CLIP_COLLECTION_IMPORT')
    expect(desktop).toContain('parseVisionClipCollectionImportText')
    expect(desktop).toContain('getClipInboxStore().importCollection')
    expect(preload).toContain('importVisionClipCollection')
  })
})
