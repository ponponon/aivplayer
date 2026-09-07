import { describe, expect, it } from 'vitest'
import { getEditingRulerIntervalSeconds, getEditingRulerTicks } from '../../src/renderer/src/app/editing-ruler'

describe('editing timeline ruler', () => {
  it('uses readable five-second ticks for a one-minute timeline at normal width', () => {
    expect(getEditingRulerIntervalSeconds(60, 1280)).toBe(5)
    expect(getEditingRulerTicks(60, 1280)).toEqual([0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60])
  })

  it('gets sparser when the timeline is narrow and denser after zooming in', () => {
    expect(getEditingRulerTicks(60, 240)).toEqual([0, 20, 40, 60])
    expect(getEditingRulerTicks(60, 3840)).toHaveLength(61)
  })

  it('keeps a readable endpoint for fractional and invalid durations', () => {
    expect(getEditingRulerTicks(59.2, 1280).at(-1)).toBe(59)
    expect(getEditingRulerTicks(Number.NaN, 1280)).toEqual([0])
  })
})
