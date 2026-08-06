import { describe, expect, it } from 'vitest'
import { applyEditingFramingPreset, EDITING_FRAMING_PRESETS, isEditingFramingPresetActive, isEditingFramingPresetAllowed } from '../../src/core/editing/framing-presets'
import type { EditingVideoClip } from '../../src/shared/editing-types'

const clip = (id: string, patch: Partial<EditingVideoClip> = {}): EditingVideoClip => ({ id, sourceId: 'source', sourceStartSeconds: 0, sourceEndSeconds: 4, ...patch })

describe('editing framing presets', () => {
  it('ships semantic baselines for every raw treatment', () => {
    expect(EDITING_FRAMING_PRESETS.map((preset) => preset.id)).toEqual(['full', 'punch-in', 'corner-br', 'corner-tl', 'split-left', 'split-right'])
    expect(EDITING_FRAMING_PRESETS.find((preset) => preset.id === 'punch-in')).toMatchObject({ scale: 1.35, anchor: 'center' })
    expect(EDITING_FRAMING_PRESETS.find((preset) => preset.id === 'corner-br')).toMatchObject({ size: 35 })
  })

  it('follows the canvas orientation rule', () => {
    const corner = EDITING_FRAMING_PRESETS.find((preset) => preset.id === 'corner-br')!
    const split = EDITING_FRAMING_PRESETS.find((preset) => preset.id === 'split-left')!
    expect(isEditingFramingPresetAllowed(corner, 'portrait')).toBe(true)
    expect(isEditingFramingPresetAllowed(corner, 'landscape')).toBe(false)
    expect(isEditingFramingPresetAllowed(split, 'landscape')).toBe(true)
    expect(isEditingFramingPresetAllowed(split, 'portrait')).toBe(false)
  })

  it('applies one preset to multiple clips and normalizes stale treatment fields', () => {
    const clips = [clip('one', { treatment: 'punch-in', treatmentScale: 1.8, treatmentAnchor: 'left' }), clip('two', { treatment: 'corner-tl', treatmentSize: 20 }), clip('three')]
    const next = applyEditingFramingPreset(clips, ['one', 'two'], 'split-left')
    expect(next[0]).toMatchObject({ treatment: 'split-left', treatmentSize: 50 })
    expect(next[0]).not.toHaveProperty('treatmentScale')
    expect(next[1]).toMatchObject({ treatment: 'split-left', treatmentSize: 50 })
    expect(next[2]).toEqual(clips[2])
    expect(isEditingFramingPresetActive(next[0]!, EDITING_FRAMING_PRESETS.find((preset) => preset.id === 'split-left')!)).toBe(true)
  })
})
