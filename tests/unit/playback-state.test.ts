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

  it('rechecks the current media when a React state updater runs later', () => {
    let playerState = { isPlaying: false }
    const pendingUpdates: Array<(state: typeof playerState) => typeof playerState> = []
    const setPlayerState: Dispatch<SetStateAction<typeof playerState>> = (update) => {
      if (typeof update === 'function') pendingUpdates.push(update)
      else playerState = update
    }
    const staleVideo = { paused: false, ended: false }
    let currentVideo: typeof staleVideo | null = staleVideo

    syncPlayerPlayingState(setPlayerState, staleVideo, () => currentVideo)
    currentVideo = { paused: true, ended: false }
    for (const update of pendingUpdates) playerState = update(playerState)

    expect(playerState.isPlaying).toBe(false)
  })

  it('rechecks the preview media when its state updater runs later', () => {
    let isPlaying = false
    const pendingUpdates: Array<(state: boolean) => boolean> = []
    const setIsPlaying: Dispatch<SetStateAction<boolean>> = (update) => {
      if (typeof update === 'function') pendingUpdates.push(update)
      else isPlaying = update
    }
    const staleVideo = { paused: false, ended: false }
    let currentVideo: typeof staleVideo | null = staleVideo

    syncBooleanPlayingState(setIsPlaying, staleVideo, () => currentVideo)
    currentVideo = { paused: true, ended: false }
    for (const update of pendingUpdates) isPlaying = update(isPlaying)

    expect(isPlaying).toBe(false)
  })
})
