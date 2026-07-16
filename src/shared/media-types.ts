import type { ClipExportLengthSeconds, ClipExportMode } from './clip-export'
import type { SubtitleTargetLanguageId } from './app-settings'

export type MediaFile = {
  id: string
  name: string
  path: string
  url: string
  extension: string
}

export type MediaProbeDetailScalar = string | number | boolean | null

export interface MediaProbeDetailObject {
  [key: string]: MediaProbeDetailValue
}

export type MediaProbeDetailValue = MediaProbeDetailScalar | MediaProbeDetailObject | MediaProbeDetailValue[]

export type MediaProbeDetails = {
  format: MediaProbeDetailObject | null
  streams: MediaProbeDetailObject[]
}

export type MediaVideoMetadata = {
  codec: string | null
  profile: string | null
  width: number | null
  height: number | null
  frameRate: number | null
  displayAspectRatio: string | null
  bitRateKbps: number | null
}

export type MediaAudioMetadata = {
  codec: string | null
  profile: string | null
  channelLayout: string | null
  sampleRateHz: number | null
  bitRateKbps: number | null
}

export type MediaProbeMetadata = {
  fileSizeBytes: number
  durationSeconds: number | null
  overallBitrateKbps: number | null
  video: MediaVideoMetadata | null
  audio: MediaAudioMetadata | null
  probeSource: 'ffprobe' | 'ffmpeg' | null
  details: MediaProbeDetails | null
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
  whisperVersion: string | null
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

export type AsrJobStage =
  | 'checking'
  | 'extracting-audio'
  | 'transcribing'
  | 'translating'
  | 'loading-subtitle'
  | 'completed'
  | 'cancelled'
  | 'failed'

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

export type AsrSubtitleGenerationStats = {
  elapsedMs: number
  subtitleCueCount: number
  cacheHit: boolean
}

export type AsrSubtitleResult = {
  success: boolean
  message: string
  subtitlePath?: string
  subtitleSrtPath?: string
  subtitleUrl?: string
  subtitleSrtUrl?: string
  subtitleLanguage?: string
  model?: AsrModelInfo
  generationStats?: AsrSubtitleGenerationStats
  errorDetails?: AsrErrorDetails
}

export type AsrErrorDetails = {
  code?: string
  status?: number
  statusText?: string
  responseBody?: string
}

export type AsrDiagnosticLogEntry = {
  timestamp: string
  event: string
  [key: string]: unknown
}

export type AsrDiagnosticLogResult = {
  success: boolean
  message: string
  entries: AsrDiagnosticLogEntry[]
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

export type AsrSubtitleTranslationRequest = {
  subtitlePath: string
  subtitleSrtPath?: string
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
}

export type AsrSubtitleTranslationStats = {
  elapsedMs: number
  subtitleCueCount: number
  translationBatchCount: number
  cacheHit: boolean
  endToEndElapsedMs?: number
}

export type AsrSubtitleTranslationResult = {
  success: boolean
  message: string
  canceled?: boolean
  sourceSubtitlePath?: string
  sourceLanguage?: string
  targetLanguage?: SubtitleTargetLanguageId
  translationModel?: string
  translationGlossary?: string
  translationStats?: AsrSubtitleTranslationStats
  subtitlePath?: string
  subtitleSrtPath?: string
  subtitleUrl?: string
  subtitleSrtUrl?: string
  errorDetails?: AsrErrorDetails
}

export type BatchSubtitleItemStatus =
  | 'queued'
  | 'asr'
  | 'translating'
  | 'retrying'
  | 'completed'
  | 'failed'
  | 'cancelled'

export type BatchSubtitleJobStatus = 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'

export type BatchSubtitleItem = {
  id: string
  file: MediaFile
  status: BatchSubtitleItemStatus
  percent: number | null
  message: string
  error?: string
  errorDetails?: AsrErrorDetails
  attempts: number
  cacheHit?: boolean
  asrElapsedMs?: number
  translationElapsedMs?: number
  subtitlePath?: string
  translatedSubtitlePath?: string
  elapsedMs?: number
  startedAt?: number
  completedAt?: number
}

export type BatchSubtitleSummary = {
  total: number
  queued: number
  processing: number
  completed: number
  failed: number
  cancelled: number
}

export type BatchSubtitleJob = {
  id: string
  rootPath: string
  targetLanguage: SubtitleTargetLanguageId
  onlyMissing: boolean
  maxConcurrent: number
  maxRetries: number
  modelId?: string
  sourceLanguage?: string
  status: BatchSubtitleJobStatus
  pauseRequested: boolean
  currentItemId: string | null
  message: string
  items: BatchSubtitleItem[]
  summary: BatchSubtitleSummary
  startedAt: number
  completedAt?: number
  elapsedMs?: number
}

export type BatchSubtitleScanRequest = {
  directoryPath: string
  recursive?: boolean
}

export type BatchSubtitleStartRequest = {
  rootPath: string
  files: MediaFile[]
  targetLanguage: SubtitleTargetLanguageId
  onlyMissing?: boolean
  maxConcurrent?: number
  maxRetries?: number
  modelId?: string
  sourceLanguage?: string
}

export type AsrTranslationServiceTestRequest = {
  sourceLanguage?: string
  targetLanguage: SubtitleTargetLanguageId
}

export type AsrTranslationServiceTestResult = {
  success: boolean
  message: string
  sourceLanguage?: string
  targetLanguage?: SubtitleTargetLanguageId
  translationModel?: string
  translationBaseUrlSummary?: string
  sampleSourceText?: string
  sampleTranslatedText?: string
  errorDetails?: AsrErrorDetails
}

export type MediaClipExportRequest = {
  mediaPath: string
  startSeconds: number
  durationSeconds: ClipExportLengthSeconds
  mode: ClipExportMode
  subtitlePath?: string
  subtitleSrtPath?: string
}

export type MediaClipExportResult = {
  success: boolean
  message: string
  videoPath?: string
  videoUrl?: string
  subtitleSrtPath?: string
  subtitleSrtUrl?: string
  canceled?: boolean
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
