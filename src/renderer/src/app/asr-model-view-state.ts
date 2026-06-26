import type {
  AsrModelDownloadProgress,
  AsrModelInfo,
  AsrModelManifest
} from '../../../shared/media-types'

export type AsrModelInstallState =
  | 'missing'
  | 'downloading'
  | 'installed-needs-runtime'
  | 'installed-ready'

export type AsrModelViewStateInput = {
  recommendedManifest: AsrModelManifest
  installedModels: AsrModelInfo[]
  isDownloadingModel: boolean
  downloadProgress: AsrModelDownloadProgress | null
  hasWhisperRuntime: boolean
  hasFfmpegRuntime: boolean
}

export type AsrModelViewState = {
  installState: AsrModelInstallState
  installedModel: AsrModelInfo | null
  statusLabel: string
  description: string
  actionLabel: string
  shouldShowProgress: boolean
}

export function buildAsrModelViewState(input: AsrModelViewStateInput): AsrModelViewState {
  const installedModel =
    input.installedModels.find((model) => model.id === input.recommendedManifest.id) ?? null

  if (installedModel) {
    if (!input.hasWhisperRuntime) {
      return {
        installState: 'installed-needs-runtime',
        installedModel,
        statusLabel: '已安装',
        description: '模型已就绪，但还需要安装 whisper.cpp 运行时。',
        actionLabel: '重新下载 / 更换来源',
        shouldShowProgress: false
      }
    }

    if (!input.hasFfmpegRuntime) {
      return {
        installState: 'installed-needs-runtime',
        installedModel,
        statusLabel: '已安装',
        description: '模型已就绪，但还需要安装 ffmpeg。',
        actionLabel: '重新下载 / 更换来源',
        shouldShowProgress: false
      }
    }

    return {
      installState: 'installed-ready',
      installedModel,
      statusLabel: '已安装',
      description: '模型已就绪，可用于本地字幕生成。',
      actionLabel: '重新下载 / 更换来源',
      shouldShowProgress: false
    }
  }

  if (input.isDownloadingModel) {
    return {
      installState: 'downloading',
      installedModel: null,
      statusLabel: '下载中',
      description: `正在从 ${input.downloadProgress?.sourceName ?? '所选来源'} 下载推荐模型。`,
      actionLabel: '下载中',
      shouldShowProgress: true
    }
  }

  return {
    installState: 'missing',
    installedModel: null,
    statusLabel: '未安装',
    description: `推荐 ${input.recommendedManifest.name}，${input.recommendedManifest.ramRequirement}。`,
    actionLabel: '下载推荐模型',
    shouldShowProgress: false
  }
}
