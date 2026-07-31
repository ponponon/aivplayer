import { describe, expect, it } from 'vitest'
import { BUILTIN_EDITING_CAPTION_EFFECTS, getEditingCaptionEffect, getEditingCaptionWordEffectState, isEditingCaptionEffect } from '../../src/core/editing/caption-effects'

describe('editing caption effects', () => {
  it('exposes a bounded Pireel-inspired effect catalog', () => {
    expect(BUILTIN_EDITING_CAPTION_EFFECTS.map((effect) => effect.id)).toEqual(['none', 'highlight', 'pill-karaoke', 'word-pop', 'kinetic-slam', 'editorial-emphasis'])
    expect(BUILTIN_EDITING_CAPTION_EFFECTS.find((effect) => effect.id === 'kinetic-slam')?.forceSingleWord).toBe(true)
    expect(isEditingCaptionEffect('word-pop')).toBe(true)
    expect(isEditingCaptionEffect('bad')).toBe(false)
    expect(getEditingCaptionEffect('bad')).toBe('none')
  })

  it('keeps pop and slam timing deterministic around the active word', () => {
    const before = getEditingCaptionWordEffectState('kinetic-slam', 1, 1.5, 0.9)
    const active = getEditingCaptionWordEffectState('kinetic-slam', 1, 1.5, 1.1)
    expect(before.active).toBe(false)
    expect(before.opacity).toBeLessThan(1)
    expect(active.active).toBe(true)
    expect(active.scale).toBeGreaterThan(0.7)
    expect(active.translateY).toBeGreaterThanOrEqual(0)
  })
})
