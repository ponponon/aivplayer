import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleTranslationRequest,
  AsrSubtitleIncrementalTranslationRequest,
  AsrSubtitleIncrementalTranslationResult,
  AsrSubtitleTranslationResult,
  AsrSubtitleSummaryRequest,
  AsrSubtitleSummaryResult,
  AsrTranslationServiceTestRequest,
  AsrTranslationServiceTestResult,
  AsrSubtitleCheckpointRequest,
  AsrSubtitleCheckpointResult,
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'
import type { AsrCacheClearResult, AsrCacheStatsResult } from '../../shared/media-types.ts'
import type { AiProviderProfile } from '../../shared/ai-providers'
import type { AppLocale } from '../../shared/localization'

export type AsrRuntime = {
  healthCheck: () => Promise<AsrRuntimeStatus>
  getAsrCacheStats: () => Promise<AsrCacheStatsResult>
  clearStaleAsrCache: () => Promise<AsrCacheClearResult>
  configureWhisperBinaryPath: (binaryPath: string) => Promise<AsrRuntimeStatus>
  autoConfigureWhisperBinaryPath: () => Promise<AsrRuntimeStatus>
  downloadModel: (
    modelId: string | undefined,
    sourceId: AsrModelSourceId | undefined,
    onProgress?: (progress: AsrModelDownloadProgress) => void
  ) => Promise<AsrModelDownloadResult>
  generateSubtitle: (
    request: AsrSubtitleRequest,
    onProgress?: (progress: AsrJobProgress) => void | Promise<void>,
    options?: { signal?: AbortSignal }
  ) => Promise<AsrSubtitleResult>
  resolveSubtitleCache: (request: AsrSubtitleRequest) => Promise<AsrSubtitleResult>
  resolveSubtitleCheckpoint: (request: AsrSubtitleCheckpointRequest) => Promise<AsrSubtitleCheckpointResult>
  resolveTranslatedSubtitleCache: (request: AsrSubtitleTranslationRequest) => Promise<AsrSubtitleTranslationResult>
  exportSubtitleSrt: (request: AsrSubtitleExportRequest) => Promise<AsrSubtitleExportResult>
  translateSubtitle: (
    request: AsrSubtitleTranslationRequest,
    options?: AsrTranslationJobOptions
  ) => Promise<AsrSubtitleTranslationResult>
  translateSubtitleIncremental: (
    request: AsrSubtitleIncrementalTranslationRequest,
    options?: AsrTranslationJobOptions
  ) => Promise<AsrSubtitleIncrementalTranslationResult>
  resolveSubtitleSummaryCache: (request: AsrSubtitleSummaryRequest) => Promise<AsrSubtitleSummaryResult>
  summarizeSubtitle: (
    request: AsrSubtitleSummaryRequest,
    options?: AsrTranslationJobOptions
  ) => Promise<AsrSubtitleSummaryResult>
  testTranslationService: (request: AsrTranslationServiceTestRequest) => Promise<AsrTranslationServiceTestResult>
}

export type AsrTranslationJobOptions = {
  signal?: AbortSignal
  onProgress?: (progress: AsrJobProgress) => void
}

export type AsrRuntimeOptions = {
  userDataPath: string
  resourcePath: string
  env?: NodeJS.ProcessEnv
  extraBinaryDirectories?: string[]
  translationFetch?: (url: string, init?: RequestInit) => Promise<Response>
  translationHeaders?: Record<string, string>
  getAiServiceSettings?: () => { providers: AiProviderProfile[]; activeProviderId: string; glossary: string | null } | null
  getLocale?: () => AppLocale
}
