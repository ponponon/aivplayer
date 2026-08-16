import type { Dispatch, SetStateAction } from 'react'

export type MediaPlaybackSnapshot = Pick<HTMLMediaElement, 'paused' | 'ended'>

/**
 * The media element is the source of truth for transport state. React state is
 * only a rendered projection and can briefly receive events from an old
 * source while a new source is being attached.
 */
export function isMediaPlaying(media: MediaPlaybackSnapshot | null | undefined): boolean {
  return Boolean(media && !media.paused && !media.ended)
}

export function syncPlayerPlayingState<State extends { isPlaying: boolean }>(
  setState: Dispatch<SetStateAction<State>>,
  media: MediaPlaybackSnapshot | null | undefined
): void {
  const isPlaying = isMediaPlaying(media)
  setState((current) => current.isPlaying === isPlaying ? current : { ...current, isPlaying })
}

export function syncBooleanPlayingState(
  setState: Dispatch<SetStateAction<boolean>>,
  media: MediaPlaybackSnapshot | null | undefined
): void {
  const isPlaying = isMediaPlaying(media)
  setState((current) => current === isPlaying ? current : isPlaying)
}
