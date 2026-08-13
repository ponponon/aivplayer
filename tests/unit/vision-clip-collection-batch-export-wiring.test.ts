import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection batch export wiring', () => {
  it('keeps the version two exporter and importer available to the next layer', () => {
    const exporter = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-export.ts'), 'utf8')
    const importer = readFileSync(join(projectRoot, 'src/core/ai/clip-inbox-import.ts'), 'utf8')

    expect(exporter).toContain('exportVersion: 2')
    expect(exporter).toContain('renderVisionClipCollectionsExport')
    expect(importer).toContain('VISION_CLIP_COLLECTION_BATCH_EXPORT_VERSION = 2')
    expect(importer).toContain('parseVisionClipCollectionsImport')
  })
})
