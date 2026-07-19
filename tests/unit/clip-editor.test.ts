import { describe, expect, it } from 'vitest'
import { formatClipTime, normalizeClipSelection, roundClipTime } from '../../src/renderer/src/app/clip-editor'

describe('clip editor helpers', () => {
  it('rounds editor time to tenths of a second and rejects invalid values', () => {
    expect(roundClipTime(1.26)).toBe(1.3)
    expect(roundClipTime(-2)).toBe(0)
    expect(roundClipTime(Number.NaN)).toBe(0)
    expect(formatClipTime(1.2)).toBe('00:01.2')
    expect(formatClipTime(65)).toBe('01:05')
  })

  it('keeps the selection inside the media duration with a non-zero range', () => {
    expect(normalizeClipSelection(-3, 50, 30)).toEqual({ startSeconds: 0, endSeconds: 30 })
    expect(normalizeClipSelection(29.99, 30, 30)).toEqual({ startSeconds: 29.9, endSeconds: 30 })
    expect(normalizeClipSelection(15, 5, 30)).toEqual({ startSeconds: 15, endSeconds: 15.1 })
  })

  it('supports short media shorter than the minimum normal clip duration', () => {
    expect(normalizeClipSelection(0, 0, 0.05)).toEqual({ startSeconds: 0, endSeconds: 0.05 })
  })
})
