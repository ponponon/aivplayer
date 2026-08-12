import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('editing caption two-point sync smoke source', () => {
  it('covers multi-select, target markers, undo/redo, and reload persistence', async () => {
    const source = await readFile(new URL('../../scripts/smoke-editing-caption-two-point-sync.ts', import.meta.url), 'utf8')

    expect(source).toContain("click({ modifiers: ['Meta'] })")
    expect(source).toContain('editing-caption-sync-mark-start')
    expect(source).toContain('editing-caption-sync-mark-end')
    expect(source).toContain('editing-caption-sync-apply-multi')
    expect(source).toContain('editing-undo')
    expect(source).toContain('editing-redo')
    expect(source).toContain('reloadPersisted')
  })
})
