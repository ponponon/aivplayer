import { describe, expect, it } from 'vitest'
import { getNextRepeatMode, getPlaybackEndedIndex } from '../../src/shared/playback-policy'

describe('playback policy', () => {
  it('continues to the next item or stops according to the end action', () => {
    expect(getPlaybackEndedIndex({ currentIndex: 0, itemCount: 3, endAction: 'next', repeatMode: 'none', order: 'normal' })).toBe(1)
    expect(getPlaybackEndedIndex({ currentIndex: 0, itemCount: 3, endAction: 'stop', repeatMode: 'none', order: 'normal' })).toBeNull()
    expect(getPlaybackEndedIndex({ currentIndex: 2, itemCount: 3, endAction: 'next', repeatMode: 'none', order: 'normal' })).toBeNull()
  })

  it('supports current and playlist repeat', () => {
    expect(getPlaybackEndedIndex({ currentIndex: 1, itemCount: 3, endAction: 'stop', repeatMode: 'current', order: 'normal' })).toBe(1)
    expect(getPlaybackEndedIndex({ currentIndex: 1, itemCount: 3, endAction: 'stop', repeatMode: 'all', order: 'normal' })).toBe(2)
    expect(getPlaybackEndedIndex({ currentIndex: 2, itemCount: 3, endAction: 'stop', repeatMode: 'all', order: 'normal' })).toBe(0)
    expect(getNextRepeatMode('none')).toBe('current')
    expect(getNextRepeatMode('current')).toBe('all')
    expect(getNextRepeatMode('all')).toBe('none')
  })

  it('chooses a different item when shuffle is enabled', () => {
    expect(getPlaybackEndedIndex({ currentIndex: 1, itemCount: 3, endAction: 'next', repeatMode: 'none', order: 'shuffle' }, () => 0)).toBe(0)
    expect(getPlaybackEndedIndex({ currentIndex: 1, itemCount: 3, endAction: 'stop', repeatMode: 'none', order: 'shuffle' }, () => 0)).toBeNull()
    expect(getPlaybackEndedIndex({ currentIndex: 0, itemCount: 1, endAction: 'next', repeatMode: 'all', order: 'shuffle' }, () => 0)).toBe(0)
  })
})
