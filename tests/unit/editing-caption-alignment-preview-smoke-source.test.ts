import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('editing caption alignment preview smoke source', () => {
  it('covers candidate evidence, apply, undo/redo, and reload persistence', async () => {
    const source = await readFile(new URL('../../scripts/smoke-editing-caption-alignment-preview.ts', import.meta.url), 'utf8')

    expect(source).toContain('editing-caption-alignment-generate')
    expect(source).toContain('editing-caption-alignment-apply')
    expect(source).toContain('当前播放头')
    expect(source).toContain('人工视觉锚点')
    expect(source).toContain('editing-undo')
    expect(source).toContain('editing-redo')
    expect(source).toContain('reloadPersisted')
  })
})
