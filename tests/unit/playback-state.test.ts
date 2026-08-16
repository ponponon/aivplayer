import { describe, expect, it } from 'vitest'
import type { Dispatch, SetStateAction } from 'react'
import { isMediaPlaying, syncBooleanPlayingState, syncPlayerPlayingState } from '../../src/renderer/src/app/playback-state'

describe('media playback state projection', () => {
  it('uses the media element state as the playback truth', () => {
    expect(isMediaPlaying({ paused: false, ended: false })).toBe(true)
    expect(isMediaPlaying({ paused: true, ended: false })).toBe(false)
    expect(isMediaPlaying({ paused: false, ended: true })).toBe(false)
    expect(isMediaPlaying(null)).toBe(false)
  })

  it('does not let an old media element overwrite the current state', () => {
    let playerState = { isPlaying: false }
    const setPlayerState: Dispatch<SetStateAction<typeof playerState>> = (update) => {
      playerState = typeof update === 'function' ? update(playerState) : update
    }
    const staleVideo = { paused: false, ended: false }
    const currentVideo = { paused: true, ended: false }

    syncPlayerPlayingState(setPlayerState, staleVideo, currentVideo)
    expect(playerState.isPlaying).toBe(false)

    syncPlayerPlayingState(setPlayerState, currentVideo, currentVideo)
    expect(playerState.isPlaying).toBe(false)

    const playingCurrentVideo = { paused: false, ended: false }
    syncPlayerPlayingState(setPlayerState, playingCurrentVideo, playingCurrentVideo)
    expect(playerState.isPlaying).toBe(true)
  })

  it('applies the same stale-source guard to standalone preview state', () => {
    let isPlaying = false
    const setIsPlaying: Dispatch<SetStateAction<boolean>> = (update) => {
      isPlaying = typeof update === 'function' ? update(isPlaying) : update
    }
    const staleVideo = { paused: false, ended: false }
    const currentVideo = { paused: true, ended: false }

    syncBooleanPlayingState(setIsPlaying, staleVideo, currentVideo)
    expect(isPlaying).toBe(false)
  })
})
