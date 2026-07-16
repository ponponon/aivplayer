import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export function useSubtitleGeneration(model: AppModel, derived: AppDerived) {
  const generateSubtitle = async (): Promise<AsrSubtitleResult | null> => {
    if (!model.state.currentFile) return null
    model.asrStartedAtRef.current = performance.now()
    model.setAsrElapsedMs(0)
    model.setIsAsrBusy(true)
    model.setSubtitleResult(null)
    model.setTranslatedSubtitleResult(null)
    model.setSubtitleSummaryResult(null)
    model.setSummaryNotice(null)
    model.setAsrNotice(null)
    model.setAsrProgress({ stage: 'checking', percent: 0, message: derived.copy.runtime.preparingSubtitleCache })
    try {
      const result = await window.aiv.generateAsrSubtitle({
        mediaPath: model.state.currentFile.path,
        modelId: model.asrStatus?.recommendedModelManifest.id,
        language: model.appSettings.asr.defaultSubtitleLanguage
      })
      model.setSubtitleResult(result.success ? result : null)
      model.setAsrNotice(result)
      model.setAsrElapsedMs(result.generationStats?.elapsedMs ?? model.asrElapsedMs)
      if (result.success && result.subtitleUrl) model.setActiveSubtitle(result)
      return result.success && result.subtitlePath ? result : null
    } finally {
      model.setIsAsrBusy(false)
      model.asrStartedAtRef.current = null
    }
  }

  return { generateSubtitle }
}
