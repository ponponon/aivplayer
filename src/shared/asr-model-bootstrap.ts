import type {
  AsrModelDownloadProgress,
  AsrModelManifest,
  AsrModelSourceId,
  AsrModelDownloadResult,
  AsrRuntimeStatus
} from './media-types'

export type AsrModelBootstrapStatus = 'idle' | 'checking' | 'downloading' | 'ready' | 'blocked' | 'error'

export type AsrModelBootstrapState = {
  status: AsrModelBootstrapStatus
  modelId: string
  fileName: string
  sourceId: AsrModelSourceId
  sourceName: string
  progress: AsrModelDownloadProgress | null
  message: string
  error?: string
}

export type AsrModelBootstrapRuntime = {
  healthCheck: () => Promise<AsrRuntimeStatus>
  downloadModel: (
    modelId: string | undefined,
    sourceId: AsrModelSourceId | undefined,
    onProgress?: (progress: AsrModelDownloadProgress) => void
  ) => Promise<AsrModelDownloadResult>
}

export function createAsrModelBootstrapState(
  manifest: AsrModelManifest,
  sourceId?: AsrModelSourceId,
  status: AsrModelBootstrapStatus = 'idle'
): AsrModelBootstrapState {
  const source = manifest.sources.find((candidate) => candidate.id === sourceId) ?? manifest.sources[0]
  return {
    status,
    modelId: manifest.id,
    fileName: manifest.fileName,
    sourceId: source.id,
    sourceName: source.name,
    progress: null,
    message: ''
  }
}

export async function runAsrModelBootstrap(options: {
  runtime: AsrModelBootstrapRuntime
  manifest: AsrModelManifest
  sourceId?: AsrModelSourceId
  onState: (state: AsrModelBootstrapState) => void
}): Promise<AsrModelBootstrapState> {
  const { runtime, manifest, sourceId, onState } = options
  const initial = createAsrModelBootstrapState(manifest, sourceId, 'checking')
  onState(initial)

  const runtimeStatus = await runtime.healthCheck()
  if (!runtimeStatus.binaryPath || !runtimeStatus.ffmpegPath) {
    const blockedState: AsrModelBootstrapState = {
      ...initial,
      status: 'blocked',
      message: runtimeStatus.message,
      error: runtimeStatus.message
    }
    onState(blockedState)
    return blockedState
  }

  const hasInstalledModel = runtimeStatus.installedModels.some((model) => model.id === manifest.id)

  if (hasInstalledModel) {
    const readyState: AsrModelBootstrapState = {
      ...initial,
      status: 'ready',
      message: runtimeStatus.message
    }
    onState(readyState)
    return readyState
  }

  let downloadingState: AsrModelBootstrapState = {
    ...initial,
    status: 'downloading',
    message: `正在后台下载 ${manifest.name}`
  }
  onState(downloadingState)

  let result: AsrModelDownloadResult
  try {
    result = await runtime.downloadModel(manifest.id, sourceId, (progress) => {
      downloadingState = {
        ...downloadingState,
        progress,
        message: progress.message
      }
      onState(downloadingState)
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const errorState: AsrModelBootstrapState = {
      ...downloadingState,
      status: 'error',
      error: message,
      message
    }
    onState(errorState)
    return errorState
  }

  if (!result.success) {
    const errorState: AsrModelBootstrapState = {
      ...downloadingState,
      status: 'error',
      error: result.message,
      message: result.message
    }
    onState(errorState)
    return errorState
  }

  const finalStatus = await runtime.healthCheck()
  const installed = finalStatus.installedModels.some((model) => model.id === manifest.id)
  if (!installed) {
    const errorState: AsrModelBootstrapState = {
      ...downloadingState,
      status: 'error',
      error: `模型下载完成但未找到 ${manifest.fileName}`,
      message: `模型下载完成但未找到 ${manifest.fileName}`
    }
    onState(errorState)
    return errorState
  }

  const readyState: AsrModelBootstrapState = {
    ...downloadingState,
    status: 'ready',
    message: result.message,
    progress: downloadingState.progress
  }
  onState(readyState)
  return readyState
}
