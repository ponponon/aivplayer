import { describe, expect, it } from 'vitest'
import { GPU_DISABLE_SWITCHES, shouldDisableGpu } from '../../src/core/gpu-settings'

describe('GPU startup settings', () => {
  it('disables Chromium GPU only when forced or explicitly turned off', () => {
    expect(shouldDisableGpu({ forceDisable: false, gpuAcceleration: true })).toBe(false)
    expect(shouldDisableGpu({ forceDisable: false, gpuAcceleration: false })).toBe(true)
    expect(shouldDisableGpu({ forceDisable: true, gpuAcceleration: true })).toBe(true)
    expect(GPU_DISABLE_SWITCHES).toEqual(['disable-gpu', 'disable-gpu-compositing'])
  })
})
