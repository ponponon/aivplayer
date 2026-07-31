import { describe, expect, it } from 'vitest'
import { BUILTIN_EDITING_CANVASES, getEditingCanvasDimensions, getEditingCanvasPreset, isEditingCanvasPresetId } from '../../src/core/editing/canvases'

describe('editing canvas presets', () => {
  it('exposes the source, landscape, portrait and square presets', () => {
    expect(BUILTIN_EDITING_CANVASES.map((preset) => preset.id)).toEqual(['source', 'landscape', 'portrait', 'square'])
    expect(isEditingCanvasPresetId('portrait')).toBe(true)
    expect(isEditingCanvasPresetId('panorama')).toBe(false)
    expect(getEditingCanvasPreset('unknown').id).toBe('source')
  })

  it('keeps source dimensions while normalizing them to even video sizes', () => {
    expect(getEditingCanvasDimensions('source', 1281, 721)).toEqual({ width: 1280, height: 720, ratio: '1280:720', fitMode: 'contain' })
  })

  it('derives social canvas sizes from the longest source edge', () => {
    expect(getEditingCanvasDimensions('portrait', 1920, 1080)).toEqual({ width: 1080, height: 1920, ratio: '9:16', fitMode: 'cover' })
    expect(getEditingCanvasDimensions('landscape', 1080, 1920)).toEqual({ width: 1920, height: 1080, ratio: '16:9', fitMode: 'cover' })
    expect(getEditingCanvasDimensions('square', 1920, 1080)).toEqual({ width: 1080, height: 1080, ratio: '1:1', fitMode: 'cover' })
  })
})
