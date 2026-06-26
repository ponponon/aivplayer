import type {
  AsrJobProgress,
  AsrModelDownloadProgress,
  AsrModelDownloadResult,
  AsrModelSourceId,
  AsrRuntimeStatus,
  AsrSubtitleRequest,
  AsrSubtitleResult
} from '../../shared/media-types.ts'

export type AsrRuntime = {
  healthCheck: () => Promise<AsrRuntimeStatus>
  downloadModel: (
    modelId: string | undefined,
    sourceId: AsrModelSourceId | undefined,
    onProgress?: (progress: AsrModelDownloadProgress) => void
  ) => Promise<AsrModelDownloadResult>
  generateSubtitle: (
    request: AsrSubtitleRequest,
    onProgress?: (progress: AsrJobProgress) => void
  ) => Promise<AsrSubtitleResult>
}

export type AsrRuntimeOptions = {
  userDataPath: string
  resourcePath: string
  env?: NodeJS.ProcessEnv
}
