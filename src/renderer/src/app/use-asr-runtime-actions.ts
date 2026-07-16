import type { AsrModelSourceId, AsrRuntimeStatus } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export function useAsrRuntimeActions(model: AppModel, derived: AppDerived) {
  const refreshAsrStatus = async (): Promise<AsrRuntimeStatus> => {
    const nextStatus = await window.aiv.checkAsrRuntime()
    model.setAsrStatus(nextStatus)
    return nextStatus
  }
  const openModelDownloadDialog = (): void => {
    if (derived.canDownloadRecommendedModel) model.setIsDownloadDialogOpen(true)
  }
  const downloadRecommendedModel = async (sourceId: AsrModelSourceId = derived.preferredModelSourceId): Promise<void> => {
    if (!model.asrStatus) return
    model.setIsDownloadDialogOpen(false)
    model.setIsDownloadingModel(true)
    model.setDownloadProgress(null)
    model.setAsrNotice(null)
    try {
      const result = await window.aiv.downloadAsrModel(model.asrStatus.recommendedModelManifest.id, sourceId)
      if (!result.success) model.setAsrProgress({ stage: 'failed', percent: null, message: result.message })
      const nextStatus = await refreshAsrStatus()
      const installed = nextStatus.installedModels.some((item) => item.id === nextStatus.recommendedModelManifest.id)
      if (result.success && installed) model.setDownloadProgress(null)
    } finally {
      model.setIsDownloadingModel(false)
    }
  }

  return { refreshAsrStatus, openModelDownloadDialog, downloadRecommendedModel }
}
