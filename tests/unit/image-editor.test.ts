import { describe, expect, it } from 'vitest'
import { createInitialImageSettings, formatImageBytes, getOutputExtension, getOutputMime, getReductionPercent } from '../../src/renderer/src/app/image-editor-formatters'

describe('image editor formatters', () => {
  it('formats source and output sizes for compact UI labels', () => {
    expect(formatImageBytes(800)).toBe('800 B')
    expect(formatImageBytes(12 * 1024)).toBe('12 KB')
    expect(formatImageBytes(2 * 1024 * 1024)).toBe('2.00 MB')
  })

  it('keeps supported original formats and normalizes jpeg extension', () => {
    expect(getOutputMime('original', 'image/webp')).toBe('image/webp')
    expect(getOutputMime('original', 'image/gif')).toBe('image/png')
    expect(getOutputExtension('jpeg', 'photo.png')).toBe('jpg')
    expect(getOutputExtension('original', 'photo.jpeg')).toBe('jpg')
  })

  it('creates locked, quality-first settings from image metadata', () => {
    const settings = createInitialImageSettings(1600, 900, 'photo.jpg', 'image/jpeg')
    expect(settings).toMatchObject({ width: 1600, height: 900, lockAspectRatio: true, format: 'jpeg', quality: 0.86 })
  })

  it('reports only real reductions', () => {
    expect(getReductionPercent(1000, 700)).toBe(30)
    expect(getReductionPercent(1000, 1200)).toBe(0)
  })
})
