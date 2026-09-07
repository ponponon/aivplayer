import { describe, expect, it } from 'vitest'
import { clampComparisonTime, getComparisonDuration } from '../../src/shared/playback-comparison'

describe('playback comparison timing', () => {
  it('uses the shorter known duration as the shared seek boundary', () => {
    expect(getComparisonDuration(120, 90)).toBe(90)
    expect(clampComparisonTime(95, 120, 90)).toBe(90)
  })

  it('keeps time usable when one duration is not known yet', () => {
    expect(getComparisonDuration(0, 90)).toBe(90)
    expect(clampComparisonTime(30, 0, 90)).toBe(30)
    expect(getComparisonDuration(0, 0)).toBe(0)
  })

  it('normalizes invalid and negative time without producing NaN', () => {
    expect(clampComparisonTime(-3, 20, 10)).toBe(0)
    expect(clampComparisonTime(Number.NaN, 20, 10)).toBe(0)
    expect(clampComparisonTime(Number.POSITIVE_INFINITY, 20, 10)).toBe(0)
  })
})
