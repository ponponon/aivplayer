import type { MediaProbeMetadata } from './media-types'

export type WebBrowserSupport = 'likely' | 'possible' | 'needs-transcode' | 'unknown'
export type WebTranscodeState = 'idle' | 'queued' | 'running' | 'ready' | 'error'
export type WebMediaSourceKind = 'playlist' | 'directory'

export type WebMediaTrack = {
  id: string
  label: string
  language: string | null
  codec: string | null
  streamIndex: number | null
  default: boolean
}

export type WebSubtitleTrack = WebMediaTrack & {
  url: string
}

export type WebAudioTrack = WebMediaTrack & {
  streamUrl: string
}

export type WebTranscodeStatus = {
  state: WebTranscodeState
  progress: number | null
  outputBytes: number
  message: string | null
  streamUrl: string | null
}

export type WebShareStatus = {
  running: boolean
  port: number | null
  urls: string[]
  sharedFileCount: number
  sharedDirectoryCount: number
  sharedDirectoryPaths: string[]
  allowRemoteControl?: boolean
}

export type WebShareStartRequest = {
  filePaths: string[]
  directoryPaths?: string[]
  allowRemoteControl?: boolean
}

export type WebDesktopState = {
  updatedAt: number
  currentMediaId: string | null
  currentMediaName: string | null
  currentTime: number
  duration: number
  isPlaying: boolean
  volume: number
  muted: boolean
  playbackRate: number
  playlistMediaIds: string[]
}

export type WebDesktopStateUpdate = {
  currentFilePath: string | null
  playlistFilePaths: string[]
  currentTime: number
  duration: number
  isPlaying: boolean
  volume: number
  muted: boolean
  playbackRate: number
}

export type WebRemoteCommand =
  | { type: 'play' | 'pause' | 'toggle' | 'next' | 'previous' }
  | { type: 'seek'; position: number }
  | { type: 'select'; mediaId: string }
  | { type: 'volume'; volume: number; muted?: boolean }

export type WebRemoteCommandForDesktop = WebRemoteCommand & { mediaPath?: string }

export type WebShareMediaItem = {
  id: string
  name: string
  extension: string
  mimeType: string
  sizeBytes: number
  modifiedAt: number
  streamUrl: string
  subtitleUrl: string | null
  browserSupport: WebBrowserSupport
  transcodeUrl: string | null
  durationSeconds: number | null
  videoCodec: string | null
  audioCodec: string | null
  sourceKind: WebMediaSourceKind
  sourceGroupId: string
  sourceGroupLabel: string
  relativePath: string
  thumbnailUrl: string
}

export type WebShareMediaDetails = WebShareMediaItem & {
  metadata: MediaProbeMetadata | null
  subtitleTracks: WebSubtitleTrack[]
  audioTracks: WebAudioTrack[]
}

export type WebShareLibraryResponse = {
  items: WebShareMediaItem[]
}
