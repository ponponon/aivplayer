import { describe, expect, it } from 'vitest'
import { clamp, formatPlaybackTimeLabel, formatTime } from '../../src/renderer/src/lib/time'

describe('time helpers', () => {
  it('formats short durations', () => {
    expect(formatTime(0)).toBe('00:00')
    expect(formatTime(65.8)).toBe('01:05')
  })

  it('formats hour-long durations', () => {
    expect(formatTime(3661)).toBe('01:01:01')
  })

  it('formats remaining playback time by default', () => {
    expect(formatPlaybackTimeLabel(65, 125, false)).toBe('-01:00')
  })

  it('formats total playback time when enabled', () => {
    expect(formatPlaybackTimeLabel(65, 125, true)).toBe('02:05')
  })

  it('clamps seek values', () => {
    expect(clamp(-5, 0, 10)).toBe(0)
    expect(clamp(15, 0, 10)).toBe(10)
    expect(clamp(4, 0, 10)).toBe(4)
  })
})
