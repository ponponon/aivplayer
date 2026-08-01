import type { MediaProbeMetadata } from './media-types'

export type WebBrowserSupport = 'likely' | 'possible' | 'needs-transcode' | 'unknown'
export type WebTranscodeState = 'idle' | 'queued' | 'running' | 'ready' | 'error'

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
}

export type WebShareStartRequest = {
  filePaths: string[]
}

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
}

export type WebShareMediaDetails = WebShareMediaItem & {
  metadata: MediaProbeMetadata | null
}

export type WebShareLibraryResponse = {
  items: WebShareMediaItem[]
}
