import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const projectRoot = process.cwd()

describe('vision clip collection import UI', () => {
  it('exposes import beside saved collections and refreshes the collection view', () => {
    const panel = readFileSync(join(projectRoot, 'src/renderer/src/app/vision-panel.tsx'), 'utf8')
    expect(panel).toContain('importVisionClipCollection')
    expect(panel).toContain('collectionImport')
    expect(panel).toContain('setCollections((current) => [result.collection!')
    expect(panel).toContain('savedCollectionEmpty')
  })
})
