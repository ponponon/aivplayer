import type { SubtitleTargetLanguageId } from './app-settings'

export type AsrRuntimeStatus = { available: boolean; backend: 'whisper.cpp'; binaryPath: string | null; ffmpegPath: string | null; modelDirectory: string; installedModels: AsrModelInfo[]; recommendedModel: string; recommendedModelManifest: AsrModelManifest; whisperVersion: string | null; message: string }
export type AsrRuntimeSetupResult = { success: boolean; canceled?: boolean; message: string; status?: AsrRuntimeStatus }
export type AsrModelInfo = { id: string; name: string; path: string; sizeBytes: number }
export type AsrModelSourceId = 'modelscope' | 'huggingface'
export type AsrModelDownloadSource = { id: AsrModelSourceId; name: string; region: string; url: string; description: string; sha256?: string }
export type AsrModelManifest = { id: string; name: string; fileName: string; sources: AsrModelDownloadSource[]; expectedSizeBytes: number; ramRequirement: string; description: string }
export type AsrModelDownloadProgress = { modelId: string; fileName: string; sourceId: AsrModelSourceId; sourceName: string; receivedBytes: number; totalBytes: number | null; percent: number | null; message: string }
export type AsrModelDownloadResult = { success: boolean; message: string; sourceId?: AsrModelSourceId; sourceName?: string; model?: AsrModelInfo }
export type AsrJobStage = 'checking' | 'extracting-audio' | 'transcribing' | 'translating' | 'summarizing' | 'loading-subtitle' | 'completed' | 'cancelled' | 'failed'
export type AsrJobProgress = { stage: AsrJobStage; percent: number | null; message: string }
export type AsrSubtitleRequest = { mediaPath: string; modelId?: string; language?: string }
export type AsrSubtitleGenerationStats = { elapsedMs: number; subtitleCueCount: number; cacheHit: boolean }
export type AsrErrorDetails = { code?: string; status?: number; statusText?: string; responseBody?: string }
export type AsrSubtitleResult = { success: boolean; message: string; canceled?: boolean; subtitlePath?: string; subtitleSrtPath?: string; subtitleUrl?: string; subtitleSrtUrl?: string; subtitleLanguage?: string; model?: AsrModelInfo; generationStats?: AsrSubtitleGenerationStats; errorDetails?: AsrErrorDetails }
export type AsrDiagnosticLogEntry = { timestamp: string; event: string; [key: string]: unknown }
export type AsrDiagnosticLogResult = { success: boolean; message: string; entries: AsrDiagnosticLogEntry[] }
export type AsrSubtitleExportRequest = { subtitlePath: string; subtitleSrtPath?: string }
export type AsrSubtitleExportResult = { success: boolean; message: string; subtitlePath?: string; subtitleSrtPath?: string; subtitleSrtUrl?: string }
export type AsrSubtitleTranslationRequest = { subtitlePath: string; subtitleSrtPath?: string; sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId }
export type AsrSubtitleTranslationStats = { elapsedMs: number; subtitleCueCount: number; translationBatchCount: number; cacheHit: boolean; endToEndElapsedMs?: number }
export type AsrSubtitleTranslationResult = { success: boolean; message: string; canceled?: boolean; sourceSubtitlePath?: string; sourceLanguage?: string; targetLanguage?: SubtitleTargetLanguageId; translationModel?: string; translationGlossary?: string; translationStats?: AsrSubtitleTranslationStats; subtitlePath?: string; subtitleSrtPath?: string; subtitleUrl?: string; subtitleSrtUrl?: string; errorDetails?: AsrErrorDetails }
export type AsrTranslationServiceTestRequest = { sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId }
export type AsrTranslationServiceTestResult = { success: boolean; message: string; sourceLanguage?: string; targetLanguage?: SubtitleTargetLanguageId; translationModel?: string; translationBaseUrlSummary?: string; sampleSourceText?: string; sampleTranslatedText?: string; errorDetails?: AsrErrorDetails }

export type AsrSubtitleSummaryCharacter = { name: string; role: string }
export type AsrSubtitleSummaryMode = 'quick' | 'detailed'
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
export type AsrSubtitleSummaryRequest = { subtitlePath: string; sourceLanguage?: string; targetLanguage: SubtitleTargetLanguageId; mode?: AsrSubtitleSummaryMode; force?: boolean }
export type AsrSubtitleSummaryResult = { success: boolean; message: string; canceled?: boolean; sourceSubtitlePath?: string; sourceLanguage?: string; targetLanguage?: SubtitleTargetLanguageId; mode?: AsrSubtitleSummaryMode; summaryModel?: string; summary?: AsrSubtitleSummary; summaryStats?: AsrSubtitleSummaryStats; errorDetails?: AsrErrorDetails }
export type AsrSubtitleSummaryExportFormat = 'markdown' | 'txt' | 'json'
export type AsrSubtitleSummaryExportRequest = { format: AsrSubtitleSummaryExportFormat; content: string; defaultFileName?: string }
export type AsrSubtitleSummaryExportResult = { success: boolean; canceled?: boolean; message: string; format?: AsrSubtitleSummaryExportFormat; filePath?: string }
