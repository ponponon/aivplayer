import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleExportRequest,
  AsrSubtitleExportResult,
  AsrSubtitleTranslationRequest,
  AsrSubtitleTranslationResult,
  AsrTranslationServiceTestRequest,
  AsrTranslationServiceTestResult,
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'
import type { AppSettings } from '../../shared/app-settings'
import type { AppLocale } from '../../shared/localization'

export type AsrRuntime = {
  healthCheck: () => Promise<AsrRuntimeStatus>
  configureWhisperBinaryPath: (binaryPath: string) => Promise<AsrRuntimeStatus>
  autoConfigureWhisperBinaryPath: () => Promise<AsrRuntimeStatus>
  downloadModel: (
    modelId: string | undefined,
    sourceId: AsrModelSourceId | undefined,
    onProgress?: (progress: AsrModelDownloadProgress) => void
  ) => Promise<AsrModelDownloadResult>
  generateSubtitle: (
    request: AsrSubtitleRequest,
    onProgress?: (progress: AsrJobProgress) => void
  ) => Promise<AsrSubtitleResult>
  resolveSubtitleCache: (request: AsrSubtitleRequest) => Promise<AsrSubtitleResult>
  resolveTranslatedSubtitleCache: (request: AsrSubtitleTranslationRequest) => Promise<AsrSubtitleTranslationResult>
  exportSubtitleSrt: (request: AsrSubtitleExportRequest) => Promise<AsrSubtitleExportResult>
  translateSubtitle: (
    request: AsrSubtitleTranslationRequest,
    options?: AsrTranslationJobOptions
  ) => Promise<AsrSubtitleTranslationResult>
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
  getTranslationServiceSettings?: () =>
    | (Pick<AppSettings['asr'], 'translationBaseUrl' | 'translationModel' | 'translationApiKey'> &
        Partial<Pick<AppSettings['asr'], 'translationGlossary'>>)
    | null
  getLocale?: () => AppLocale
}
