export type MediaFile = {
  id: string
  name: string
  path: string
  url: string
  extension: string
}

export type PlaybackState = {
  isPlaying: boolean
  currentTime: number
  duration: number
  volume: number
  muted: boolean
  playbackRate: number
}

export type AsrRuntimeStatus = {
  available: boolean
  backend: 'whisper.cpp'
  binaryPath: string | null
  ffmpegPath: string | null
  modelDirectory: string
  installedModels: AsrModelInfo[]
  recommendedModel: string
  recommendedModelManifest: AsrModelManifest
  message: string
}

export type AsrRuntimeSetupResult = {
  success: boolean
  canceled?: boolean
  message: string
  status?: AsrRuntimeStatus
}

export type AsrModelInfo = {
  id: string
  name: string
  path: string
  sizeBytes: number
}

export type AsrModelSourceId = 'modelscope' | 'huggingface'

export type AsrModelDownloadSource = {
  id: AsrModelSourceId
  name: string
  region: string
  url: string
  description: string
  sha256?: string
}

export type AsrModelManifest = {
  id: string
  name: string
  fileName: string
  sources: AsrModelDownloadSource[]
  expectedSizeBytes: number
  ramRequirement: string
  description: string
}

export type AsrModelDownloadProgress = {
  modelId: string
  fileName: string
  sourceId: AsrModelSourceId
  sourceName: string
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
  message: string
}

export type AsrModelDownloadResult = {
  success: boolean
  message: string
  sourceId?: AsrModelSourceId
  sourceName?: string
  model?: AsrModelInfo
}

export type AsrJobStage = 'checking' | 'extracting-audio' | 'transcribing' | 'loading-subtitle' | 'completed' | 'failed'

export type AsrJobProgress = {
  stage: AsrJobStage
  percent: number | null
  message: string
}

export type AsrSubtitleRequest = {
  mediaPath: string
  modelId?: string
  language?: string
}

export type AsrSubtitleResult = {
  success: boolean
  message: string
  subtitlePath?: string
  subtitleSrtPath?: string
  subtitleUrl?: string
  subtitleSrtUrl?: string
  model?: AsrModelInfo
}

export type AsrSubtitleExportRequest = {
  subtitlePath: string
  subtitleSrtPath?: string
}

export type AsrSubtitleExportResult = {
  success: boolean
  message: string
  subtitlePath?: string
  subtitleSrtPath?: string
  subtitleSrtUrl?: string
}

export type ClipboardWriteTextRequest = {
  text: string
}

export type ClipboardWriteTextResult = {
  success: boolean
  message: string
}

export type TranscriptSegment = {
  startSeconds: number
  endSeconds: number
  text: string
}

export type NativePlayerStatus = {
  available: boolean
  backend: 'mpv'
  binaryPath: string | null
  version: string | null
  message: string
}

export type NativePlaybackResult = {
  success: boolean
  message: string
  pid?: number
}
