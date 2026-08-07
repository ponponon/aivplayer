import { describe, expect, it } from 'vitest'
import { findNearestPlaybackTrickplayFrame, getPlaybackTrickplayTimestamps } from '../../src/renderer/src/app/use-playback-trickplay'

describe('playback trickplay', () => {
  it('creates bounded, centered timestamps for short and long media', () => {
    expect(getPlaybackTrickplayTimestamps(0)).toEqual([])
    expect(getPlaybackTrickplayTimestamps(60)).toHaveLength(8)
    expect(getPlaybackTrickplayTimestamps(60)[0]).toBeCloseTo(3.75)
    expect(getPlaybackTrickplayTimestamps(3600)).toHaveLength(32)
    expect(getPlaybackTrickplayTimestamps(3600).at(-1)).toBeLessThan(3600)
  })

  it('selects the nearest available frame for a hover position', () => {
    const frames = [{ sourceSeconds: 0, url: 'a' }, { sourceSeconds: 10, url: 'b' }, { sourceSeconds: 20, url: 'c' }]
    expect(findNearestPlaybackTrickplayFrame(frames, 7)?.url).toBe('b')
    expect(findNearestPlaybackTrickplayFrame(frames, 16)?.url).toBe('c')
    expect(findNearestPlaybackTrickplayFrame([], 7)).toBeNull()
  })
})
