import { describe, expect, it } from 'vitest'
import { createEditingElementAsset, normalizeEditingElementAssets, removeEditingElementAsset, upsertEditingElementAsset } from '../../src/core/editing/element-assets'

const graphic = { id: 'graphic-1', startSeconds: 0, durationSeconds: 3, text: '重点提醒', position: 'bottom-left' as const, style: 'label' as const }

describe('editing element assets', () => {
  it('deduplicates the same reusable element and keeps the newest asset metadata', () => {
    const first = createEditingElementAsset(graphic, 100)
    const duplicate = { ...createEditingElementAsset(graphic, 200), name: '更新后的名称' }
    const next = upsertEditingElementAsset(upsertEditingElementAsset([], first), duplicate)

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: first.id, name: '更新后的名称', createdAt: 100, updatedAt: 200 })
  })

  it('normalizes persisted assets and removes one without touching the others', () => {
    const valid = createEditingElementAsset(graphic, 100)
    const normalized = normalizeEditingElementAssets([valid, { id: 'bad' }, { ...valid, id: 'second', text: '第二个' }])

    expect(normalized.map((asset) => asset.id)).toEqual([valid.id, 'second'])
    expect(removeEditingElementAsset(normalized, 'second')).toHaveLength(1)
  })
})
