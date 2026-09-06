import { describe, expect, it } from 'vitest'
import { getFullscreenControlState, getMuteAction, getShuffleAction, getToggleAction, getTransportAction } from '../../src/renderer/src/app/control-state'

describe('interactive control state contracts', () => {
  it('maps transport state to the action and icon shown for the next click', () => {
    expect(getTransportAction(false)).toBe('play')
    expect(getTransportAction(true)).toBe('pause')
  })

  it('maps mute state to a truthful action label', () => {
    expect(getMuteAction(false)).toBe('mute')
    expect(getMuteAction(true)).toBe('unmute')
  })
  it('maps shuffle state to a truthful action label', () => {
    expect(getShuffleAction(false)).toBe('enable')
    expect(getShuffleAction(true)).toBe('disable')
    expect(getToggleAction(false)).toBe('enable')
    expect(getToggleAction(true)).toBe('disable')
  })

  it('uses one fullscreen truth for both the visible state and click action', () => {
    const stage = {} as Element
    const otherElement = {} as Element

    expect(getFullscreenControlState(null, stage)).toEqual({ isActive: false, action: 'enter', isAvailable: true })
    expect(getFullscreenControlState(stage, stage)).toEqual({ isActive: true, action: 'exit', isAvailable: true })
    expect(getFullscreenControlState(otherElement, stage)).toEqual({ isActive: true, action: 'exit', isAvailable: true })
    expect(getFullscreenControlState(null, null)).toEqual({ isActive: false, action: 'enter', isAvailable: false })
  })
})
