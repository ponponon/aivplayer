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
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'
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
  exportSubtitleSrt: (request: AsrSubtitleExportRequest) => Promise<AsrSubtitleExportResult>
  translateSubtitle: (request: AsrSubtitleTranslationRequest) => Promise<AsrSubtitleTranslationResult>
}

export type AsrRuntimeOptions = {
  userDataPath: string
  resourcePath: string
  env?: NodeJS.ProcessEnv
  extraBinaryDirectories?: string[]
  translationFetch?: (url: string, init?: RequestInit) => Promise<Response>
  getLocale?: () => AppLocale
}
