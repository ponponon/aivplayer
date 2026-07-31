import { describe, expect, it } from 'vitest'
import { BUILTIN_EDITING_FRAMES, getEditingFrame, getEditingFrameStyle, isEditingFrameId } from '../../src/core/editing/frames'

describe('editing frame catalog', () => {
  it('provides distinct visual dialects with preview/export CSS variables', () => {
    expect(BUILTIN_EDITING_FRAMES).toHaveLength(5)
    expect(new Set(BUILTIN_EDITING_FRAMES.map((frame) => frame.graphicVariant)).size).toBe(5)
    expect(getEditingFrame('warm')).toMatchObject({ graphicVariant: 'sticker', accent: '#f06f4a' })
    expect(getEditingFrameStyle('warm')).toMatchObject({ '--editing-frame-accent': '#f06f4a', '--editing-frame-font-family': expect.any(String) })
  })

  it('falls back safely for legacy or invalid project values', () => {
    expect(isEditingFrameId('cinema')).toBe(true)
    expect(isEditingFrameId('unknown')).toBe(false)
    expect(getEditingFrame('unknown')).toMatchObject({ id: 'clean' })
  })
})
