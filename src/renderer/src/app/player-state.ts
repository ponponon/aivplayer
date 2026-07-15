import type { MediaFile, PlaybackState } from '../../../shared/media-types'

export type PlaylistItem = MediaFile
export type PanelMode = 'none' | 'playlist' | 'asr' | 'batch' | 'subtitles' | 'info'

export type PlayerState = PlaybackState & {
  currentFile: PlaylistItem | null
  playlist: PlaylistItem[]
  panelMode: PanelMode
  error: string | null
  autoPlayRequestId: number
  videoWidth: number
  videoHeight: number
}

export const initialPlayerState: PlayerState = {
  currentFile: null,
  playlist: [],
  panelMode: 'playlist',
  error: null,
  autoPlayRequestId: 0,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.8,
  muted: false,
  playbackRate: 1,
  videoWidth: 0,
  videoHeight: 0
}
