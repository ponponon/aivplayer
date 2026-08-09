import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision entity catalog desktop wiring', () => {
  it('keeps the catalog IPC and preload surface aligned', () => {
    const channels = readFileSync(join(projectRoot, 'src/shared/ipc-channels.ts'), 'utf8')
    const ipc = readFileSync(join(projectRoot, 'src/desktop/ipc-vision.ts'), 'utf8')
    const preload = readFileSync(join(projectRoot, 'src/preload/index.ts'), 'utf8')

    for (const channel of ['VISION_ENTITY_CATALOG_GET', 'VISION_ENTITY_CATALOG_CREATE', 'VISION_ENTITY_CATALOG_UPDATE', 'VISION_ENTITY_CATALOG_BATCH_UPDATE']) {
      expect(channels).toContain(channel)
      expect(ipc).toContain(`IPC_CHANNELS.${channel}`)
    }
    expect(preload).toContain('getVisionEntityCatalog')
    expect(preload).toContain('createVisionEntityCatalog')
    expect(preload).toContain('updateVisionEntityCatalog')
    expect(preload).toContain('updateVisionEntityCatalogBatch')
  })
})
