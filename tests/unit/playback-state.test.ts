import { describe, expect, it } from 'vitest'
import { isMediaPlaying } from '../../src/renderer/src/app/playback-state'

describe('media playback state projection', () => {
  it('uses the media element state as the playback truth', () => {
    expect(isMediaPlaying({ paused: false, ended: false })).toBe(true)
    expect(isMediaPlaying({ paused: true, ended: false })).toBe(false)
    expect(isMediaPlaying({ paused: false, ended: true })).toBe(false)
    expect(isMediaPlaying(null)).toBe(false)
  })
})
