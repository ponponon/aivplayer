import type { MediaFile } from './media-base-types'

export type PlaybackEndAction = 'stop' | 'next'
export type PlaybackRepeatMode = 'none' | 'current' | 'all'
export type PlaybackOrder = 'normal' | 'shuffle'

export type PlaybackMediaProfile = {
  positionSeconds: number
  durationSeconds: number | null
  volume: number
  muted: boolean
  playbackRate: number
  updatedAt: number
}

export type PlaybackBookmark = {
  id: string
  timeSeconds: number
  name: string
  createdAt: number
}

export function getPlaybackMediaKey(file: Pick<MediaFile, 'path' | 'fingerprint'>): string {
  return file.fingerprint?.trim() || file.path
}
