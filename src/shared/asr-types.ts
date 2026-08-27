import type { SubtitleTargetLanguageId } from './app-settings'

export type AsrRuntimeStatus = { available: boolean; backend: 'whisper.cpp'; binaryPath: string | null; ffmpegPath: string | null; modelDirectory: string; installedModels: AsrModelInfo[]; recommendedModel: string; recommendedModelManifest: AsrModelManifest; whisperVersion: string | null; message: string }
export type AsrRuntimeSetupResult = { success: boolean; canceled?: boolean; message: string; status?: AsrRuntimeStatus }
export type AsrModelInfo = { id: string; name: string; path: string; sizeBytes: number }
export type AsrModelSourceId = 'r2' | 'modelscope' | 'huggingface'
export type AsrModelDownloadSource = { id: AsrModelSourceId; name: string; region: string; url: string; description: string; sha256?: string }
export type AsrModelManifest = { id: string; name: string; fileName: string; sources: AsrModelDownloadSource[]; expectedSizeBytes: number; sha256?: string; ramRequirement: string; description: string }
export type AsrModelDownloadProgress = { modelId: string; fileName: string; sourceId: AsrModelSourceId; sourceName: string; receivedBytes: number; totalBytes: number | null; percent: number | null; message: string }
export type AsrModelDownloadResult = { success: boolean; message: string; sourceId?: AsrModelSourceId; sourceName?: string; model?: AsrModelInfo }
export type AsrJobStage = 'checking' | 'extracting-audio' | 'transcribing' | 'translating' | 'summarizing' | 'loading-subtitle' | 'completed' | 'cancelled' | 'failed'
export type AsrPriorityWindow = { startSeconds: number; durationSeconds: number; endSeconds: number }

const asrPriorityMinimumCurrentTimeSeconds = 30
const asrPriorityLeadSeconds = 15
const asrPriorityWindowDurationSeconds = 60

export function getAsrPriorityWindow(currentTime: number, duration: number): AsrPriorityWindow | null {
  if (!Number.isFinite(currentTime) || currentTime < asrPriorityMinimumCurrentTimeSeconds) return null

  const safeCurrentTime = Math.max(0, currentTime)
  const safeDuration = Number.isFinite(duration) && duration > 0 ? duration : 0
  const latestStart = safeDuration > 0 ? Math.max(0, safeDuration - asrPriorityWindowDurationSeconds) : safeCurrentTime - asrPriorityLeadSeconds
  const startSeconds = Math.max(0, Math.min(safeCurrentTime - asrPriorityLeadSeconds, latestStart))
  const endSeconds = safeDuration > 0
    ? Math.min(safeDuration, startSeconds + asrPriorityWindowDurationSeconds)
    : startSeconds + asrPriorityWindowDurationSeconds
  const durationSeconds = endSeconds - startSeconds

  return durationSeconds >= 15 ? { startSeconds, durationSeconds, endSeconds } : null
}

export type AsrJobProgress = {
  stage: AsrJobStage
  percent: number | null
  message: string
  resumingFromSeconds?: number
  mediaPath?: string
  partialSubtitlePath?: string
  partialSubtitleSrtPath?: string
  partialSubtitleCueCount?: number
  partialSubtitleRevision?: number
  partialTranslatedSubtitlePath?: string
  partialTranslatedSubtitleSrtPath?: string
  partialTranslatedSubtitleCueCount?: number
  partialTranslatedSubtitleRevision?: number
  partialTranslationSourcePath?: string
  partialTranslationSourceLanguage?: string
  partialTranslationTargetLanguage?: SubtitleTargetLanguageId
  prioritySubtitlePath?: string
  prioritySubtitleSrtPath?: string
  prioritySubtitleRevision?: number
  prioritySubtitleReady?: boolean
  priorityStartSeconds?: number
  priorityEndSeconds?: number
  priorityTranslatedSubtitlePath?: string
  priorityTranslatedSubtitleSrtPath?: string
  priorityTranslatedSubtitleRevision?: number
  priorityTranslationSourcePath?: string
  priorityTranslationSourceLanguage?: string
  priorityTranslationTargetLanguage?: SubtitleTargetLanguageId
}
export type AsrSubtitleRequest = { mediaPath: string; modelId?: string; language?: string; streamTranslationTargetLanguage?: SubtitleTargetLanguageId; priorityWindow?: AsrPriorityWindow }
export type AsrSubtitleSidecarRequest = { mediaPath: string }
export type AsrSubtitleCheckpointRequest = { mediaPath: string; modelId?: string }
export type AsrSubtitleCheckpointResult = { success: boolean; available: boolean; lastEndSeconds?: number; resumeFromSeconds?: number; subtitleCueCount?: number; message?: string }
export type AsrSubtitleGenerationStats = { elapsedMs: number; subtitleCueCount: number; cacheHit: boolean }
export type AsrErrorDetails = { code?: string; status?: number; statusText?: string; responseBody?: string }
export type AsrSubtitleResult = { success: boolean; message: string; canceled?: boolean; subtitlePath?: string; subtitleSrtPath?: string; subtitleUrl?: string; subtitleSrtUrl?: string; subtitleLanguage?: string; subtitleRevision?: number; streamingTranslation?: AsrSubtitleTranslationResult; model?: AsrModelInfo; generationStats?: AsrSubtitleGenerationStats; errorDetails?: AsrErrorDetails }
export type AsrDiagnosticLogEntry = { timestamp: string; event: string; [key: string]: unknown }
export type AsrDiagnosticLogResult = { success: boolean; message: string; entries: AsrDiagnosticLogEntry[] }
export type AsrSubtitleExportRequest = { subtitlePath: string; subtitleSrtPath?: string }
export type AsrSubtitleExportResult = { success: boolean; message: string; subtitlePath?: string; subtitleSrtPath?: string; subtitleSrtUrl?: string }
export type AsrSubtitleTranslationRequest = { mediaPath?: string; subtitlePath: string; subtitleSrtPath?: string; sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId }
export type AsrSubtitleTranslationStats = { elapsedMs: number; subtitleCueCount: number; translationBatchCount: number; cacheHit: boolean; endToEndElapsedMs?: number }
export type AsrSubtitleTranslationResult = { success: boolean; message: string; canceled?: boolean; partial?: boolean; subtitleRevision?: number; sourceSubtitleRevision?: number; sourceSubtitlePath?: string; sourceLanguage?: string; targetLanguage?: SubtitleTargetLanguageId; translationModel?: string; translationGlossary?: string; translationStats?: AsrSubtitleTranslationStats; subtitlePath?: string; subtitleSrtPath?: string; subtitleUrl?: string; subtitleSrtUrl?: string; errorDetails?: AsrErrorDetails }
export type AsrSubtitleIncrementalTranslationRequest = { sourceSubtitlePath: string; sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId; outputSubtitlePath?: string; outputSubtitleSrtPath?: string; previousTranslatedSubtitlePath?: string; translatedCueCount?: number; batchSize?: number; flush?: boolean; promoteToCache?: boolean; mediaPath?: string }
export type AsrSubtitleIncrementalTranslationResult = AsrSubtitleTranslationResult & { translatedCueCount: number; changed: boolean }
export type AsrTranslationServiceTestRequest = { sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId; provider?: { kind: 'managed' | 'custom'; baseUrl: string | null; model: string | null; apiKey: string | null } }
export type AsrTranslationServiceTestResult = { success: boolean; message: string; sourceLanguage?: string; targetLanguage?: SubtitleTargetLanguageId; translationModel?: string; translationBaseUrlSummary?: string; sampleSourceText?: string; sampleTranslatedText?: string; errorDetails?: AsrErrorDetails }

export type AsrSubtitleSummaryCharacter = { name: string; role: string }
export type AsrSubtitleSummaryMode = 'quick' | 'detailed'
export type AsrSubtitleSummarySourceType = 'raw' | 'translated'
export type AsrSubtitleSummaryChapter = { title: string; timeSeconds: number; summary: string }
export type AsrSubtitleSummary = {
  title: string
  overview: string
  synopsis: string
  keyPoints: string[]
  characters: AsrSubtitleSummaryCharacter[]
  themes: string[]
  chapters: AsrSubtitleSummaryChapter[]
  ending: string
}
export type AsrSubtitleSummaryStats = { elapsedMs: number; subtitleCueCount: number; chunkCount: number; cacheHit: boolean; inputCharacterCount: number }
export type AsrSubtitleSummaryRequest = { mediaPath?: string; subtitlePath: string; sourceLanguage?: string; sourceType?: AsrSubtitleSummarySourceType; targetLanguage: SubtitleTargetLanguageId; mode?: AsrSubtitleSummaryMode; force?: boolean }
export type AsrSubtitleSummaryResult = { success: boolean; message: string; canceled?: boolean; sourceSubtitlePath?: string; sourceSubtitleRevision?: number; sourceLanguage?: string; sourceType?: AsrSubtitleSummarySourceType; targetLanguage?: SubtitleTargetLanguageId; mode?: AsrSubtitleSummaryMode; summaryModel?: string; summary?: AsrSubtitleSummary; summaryStats?: AsrSubtitleSummaryStats; errorDetails?: AsrErrorDetails }
export type AsrSubtitleSummaryExportFormat = 'markdown' | 'txt' | 'json'
export type AsrSubtitleSummaryExportRequest = { format: AsrSubtitleSummaryExportFormat; content: string; defaultFileName?: string }
export type AsrSubtitleSummaryExportResult = { success: boolean; canceled?: boolean; message: string; format?: AsrSubtitleSummaryExportFormat; filePath?: string }

export type AsrCacheStats = {
  cacheDirectory: string
  totalBytes: number
  totalFiles: number
  subtitleBytes: number
  subtitleFiles: number
  summaryBytes: number
  summaryFiles: number
  indexBytes: number
  indexFiles: number
  otherBytes: number
  otherFiles: number
  staleIndexFiles: number
}
export type AsrCacheStatsResult = { success: boolean; message: string; stats: AsrCacheStats }
export type AsrCacheClearResult = { success: boolean; message: string; deletedFiles: number; deletedBytes: number; stats: AsrCacheStats }
