import { describe, expect, it } from 'vitest'
import { DEFAULT_EDITING_CAPTION_LAYOUT, DEFAULT_EDITING_TRANSLATION_CAPTION_LAYOUT, getEditingCaptionLayout, getEditingCaptionLineLayout, isEditingCaptionLayout, updateEditingCaptionLayout, updateEditingCaptionLineLayout } from '../../src/core/editing/caption-layout'

describe('editing caption layout', () => {
  it('provides a short-video-friendly default layout', () => {
    expect(DEFAULT_EDITING_CAPTION_LAYOUT).toEqual({ xPercent: 50, yPercent: 82, widthPercent: 82, fontSizePx: 48 })
    expect(isEditingCaptionLayout(DEFAULT_EDITING_CAPTION_LAYOUT)).toBe(true)
  })

  it('clamps interactive values while preserving valid values', () => {
    expect(getEditingCaptionLayout({ xPercent: 0, yPercent: 100, widthPercent: 120, fontSizePx: 200 })).toEqual({ xPercent: 10, yPercent: 92, widthPercent: 100, fontSizePx: 96 })
    expect(getEditingCaptionLayout({ xPercent: 42, yPercent: 76, widthPercent: 68, fontSizePx: 64 })).toEqual({ xPercent: 42, yPercent: 76, widthPercent: 68, fontSizePx: 64 })
  })

  it('derives a smaller translation line without changing legacy source layout', () => {
    expect(getEditingCaptionLineLayout(DEFAULT_EDITING_CAPTION_LAYOUT, 'source')).toEqual(DEFAULT_EDITING_CAPTION_LAYOUT)
    expect(getEditingCaptionLineLayout(DEFAULT_EDITING_CAPTION_LAYOUT, 'translation')).toEqual(DEFAULT_EDITING_TRANSLATION_CAPTION_LAYOUT)
    expect(getEditingCaptionLayout(DEFAULT_EDITING_CAPTION_LAYOUT)).toEqual(DEFAULT_EDITING_CAPTION_LAYOUT)
  })

  it('normalizes and persists an independently positioned translation line', () => {
    const layout = updateEditingCaptionLineLayout(DEFAULT_EDITING_CAPTION_LAYOUT, 'translation', { xPercent: 62, yPercent: 88, widthPercent: 64, fontSizePx: 40 })
    expect(layout.translation).toEqual({ xPercent: 62, yPercent: 88, widthPercent: 64, fontSizePx: 40 })
    expect(isEditingCaptionLayout(layout)).toBe(true)
    expect(getEditingCaptionLineLayout(layout, 'translation')).toEqual(layout.translation)
  })

  it('moves the canvas caption box and snaps it to the center guide', () => {
    expect(updateEditingCaptionLayout(DEFAULT_EDITING_CAPTION_LAYOUT, 'move', 8, -12)).toMatchObject({ xPercent: 58, yPercent: 70 })
    expect(updateEditingCaptionLayout({ ...DEFAULT_EDITING_CAPTION_LAYOUT, xPercent: 47 }, 'move', 1.5)).toMatchObject({ xPercent: 50 })
  })

  it('resizes one edge while keeping the opposite edge anchored', () => {
    expect(updateEditingCaptionLayout(DEFAULT_EDITING_CAPTION_LAYOUT, 'resize-left', 10)).toMatchObject({ xPercent: 55, widthPercent: 72 })
    expect(updateEditingCaptionLayout(DEFAULT_EDITING_CAPTION_LAYOUT, 'resize-right', 5)).toMatchObject({ xPercent: 52.5, widthPercent: 87 })
    expect(updateEditingCaptionLayout({ ...DEFAULT_EDITING_CAPTION_LAYOUT, widthPercent: 32 }, 'resize-left', 40).widthPercent).toBe(30)
  })
})
