import type { LocaleCopy } from '../../../shared/i18n'
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
  copy: LocaleCopy
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
        statusLabel: input.copy.modelView.installedLabel,
        description: input.copy.modelView.installedNeedsWhisper,
        actionLabel: input.copy.modelView.redownload,
        shouldShowProgress: false
      }
    }

    if (!input.hasFfmpegRuntime) {
      return {
        installState: 'installed-needs-runtime',
        installedModel,
        statusLabel: input.copy.modelView.installedLabel,
        description: input.copy.modelView.installedNeedsFfmpeg,
        actionLabel: input.copy.modelView.redownload,
        shouldShowProgress: false
      }
    }

    return {
      installState: 'installed-ready',
      installedModel,
      statusLabel: input.copy.modelView.installedLabel,
      description: input.copy.modelView.installedReady,
      actionLabel: input.copy.modelView.redownload,
      shouldShowProgress: false
    }
  }

  if (input.isDownloadingModel) {
    return {
      installState: 'downloading',
      installedModel: null,
      statusLabel: input.copy.modelView.downloadingLabel,
      description: input.copy.modelView.downloading(input.downloadProgress?.sourceName ?? input.copy.modelSources[input.recommendedManifest.sources[0].id].title),
      actionLabel: input.copy.modelView.downloadRecommended,
      shouldShowProgress: true
    }
  }

  return {
    installState: 'missing',
    installedModel: null,
    statusLabel: input.copy.modelView.missingLabel,
    description: input.copy.modelView.missing(input.recommendedManifest.name, input.recommendedManifest.ramRequirement),
    actionLabel: input.copy.modelView.downloadRecommended,
    shouldShowProgress: false
  }
}
