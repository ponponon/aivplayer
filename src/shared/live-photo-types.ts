export type LivePhotoFormat = 'xiaomi' | 'google-motion-photo' | 'apple-live-photo'

export type LivePhotoProbeResult = {
  format: LivePhotoFormat
  formatLabel: string
  sourcePath: string
  motionPath: string
  motionUrl: string
  durationSeconds: number
  hasAudio: boolean
  videoWidth: number
  videoHeight: number
  metadataVersion?: number
  metadataSummary?: string
  videoPresentationTimestampUs?: number
}

export type LivePhotoMosaic = {
  enabled: boolean
  x: number
  y: number
  width: number
  height: number
}

export type LivePhotoEditOptions = {
  startSeconds: number
  durationSeconds: number
  cropScale: number
  mute: boolean
  mosaic: LivePhotoMosaic
}

export type LivePhotoExportRequest = {
  sourcePath: string
  options: LivePhotoEditOptions
  coverDataUrl?: string
}

export type LivePhotoExportResult = {
  success: boolean
  canceled?: boolean
  filePath?: string
  motionPath?: string
  message: string
  format?: LivePhotoFormat
}
