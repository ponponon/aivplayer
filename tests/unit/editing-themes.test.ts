import { describe, expect, it } from 'vitest'
import { BUILTIN_EDITING_THEMES, createEditingTheme, normalizeEditingThemes, removeEditingTheme, upsertEditingTheme } from '../../src/core/editing/themes'
import { applyEditingGraphicTheme } from '../../src/core/editing/graphic-operations'

const { id: _presetId, ...settings } = BUILTIN_EDITING_THEMES[1]

describe('editing themes', () => {
  it('ships five coherent built-in combinations and applies graphic defaults as one batch', () => {
    expect(BUILTIN_EDITING_THEMES).toHaveLength(5)
    expect(BUILTIN_EDITING_THEMES.map((theme) => theme.id)).toEqual(['clean', 'warm', 'mint', 'cinema', 'gold'])
    const graphics = [{ id: 'graphic-1', startSeconds: 0, durationSeconds: 3, text: '重点', position: 'center' as const, style: 'title' as const }]
    expect(applyEditingGraphicTheme(graphics, 'label', 'bottom-left')[0]).toMatchObject({ position: 'bottom-left', style: 'label' })
  })

  it('deduplicates saved themes by visual settings and preserves the newest name', () => {
    const first = createEditingTheme('暖黄模板', settings, 100)
    const duplicate = { ...createEditingTheme('短视频模板', settings, 200), id: 'theme-new' }
    const next = upsertEditingTheme(upsertEditingTheme([], first), duplicate)

    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: first.id, name: '短视频模板', createdAt: 100, updatedAt: 200 })
    expect(removeEditingTheme(next, first.id)).toEqual([])
  })

  it('normalizes persisted data and keeps the limit bounded', () => {
    const valid = createEditingTheme('可用', settings, 100)
    const normalized = normalizeEditingThemes([valid, { id: 'bad', name: '坏数据' }, { ...valid, id: 'second', subtitlePresetId: 'bad' }])

    expect(normalized).toHaveLength(1)
    expect(normalized[0]?.id).toBe(valid.id)
  })

  it('defaults themes saved by the previous version to a neutral caption effect', () => {
    const legacy = { ...createEditingTheme('旧主题', settings, 100), captionEffect: undefined }
    expect(normalizeEditingThemes([legacy])[0]?.captionEffect).toBe('none')
  })
})
