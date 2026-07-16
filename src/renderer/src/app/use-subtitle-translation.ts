import type { AppSettings, SubtitleTargetLanguageId } from '../../../shared/app-settings'
import type { AsrSubtitleResult, AsrSubtitleTranslationResult } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export type SubtitleTranslationActions = {
  translateSubtitle: (targetLanguage?: SubtitleTargetLanguageId, sourceSubtitle?: AsrSubtitleResult | null, flowStartedAt?: number) => Promise<AsrSubtitleTranslationResult | null>
  cancelTranslation: () => Promise<void>
}

export function useSubtitleTranslation(model: AppModel, derived: AppDerived, patchSubtitleDisplaySettings: (patch: Partial<AppSettings['subtitles']>) => void): SubtitleTranslationActions {
  const translateSubtitle = async (
    targetLanguage: SubtitleTargetLanguageId = model.appSettings.subtitles.targetLanguage,
    sourceSubtitle: AsrSubtitleResult | null = null,
    flowStartedAt?: number
  ): Promise<AsrSubtitleTranslationResult | null> => {
    const sourceSubtitlePath = sourceSubtitle?.subtitlePath ?? derived.subtitlePath
    const sourceSubtitleSrtPath = sourceSubtitle?.subtitleSrtPath ?? derived.subtitleSrtPath
    const sourceLanguage = sourceSubtitle?.subtitleLanguage ?? derived.subtitleTranslationSourceLanguage
    if (!sourceSubtitlePath || model.isTranslatingSubtitle) return null
    model.translationStartedAtRef.current = performance.now()
    model.setTranslationElapsedMs(0)
    model.setIsTranslatingSubtitle(true)
    model.setAsrNotice(null)
    model.setAsrProgress({ stage: 'translating', percent: 0, message: derived.copy.asrPanel.translatingSubtitle })
    try {
      const result = await window.aiv.translateAsrSubtitle({ subtitlePath: sourceSubtitlePath, subtitleSrtPath: sourceSubtitleSrtPath ?? undefined, sourceLanguage, targetLanguage })
      const timedResult = result.success && result.translationStats && flowStartedAt != null
        ? { ...result, translationStats: { ...result.translationStats, endToEndElapsedMs: Math.max(0, Math.round(performance.now() - flowStartedAt)) } }
        : result
      model.setTranslationElapsedMs(timedResult.translationStats?.elapsedMs ?? model.translationElapsedMs)
      model.setTranslatedSubtitleResult(timedResult.success ? timedResult : null)
      model.setAsrNotice(timedResult)
      if (timedResult.success && timedResult.subtitleUrl && model.appSettings.subtitles.displayMode === 'source') patchSubtitleDisplaySettings({ displayMode: 'translation' })
      return timedResult
    } finally {
      model.setIsTranslatingSubtitle(false)
      model.setAsrProgress(null)
      model.translationStartedAtRef.current = null
    }
  }
  const cancelTranslation = async (): Promise<void> => {
    if (model.isTranslatingSubtitle) await window.aiv.cancelAsrTranslation()
  }
  return { translateSubtitle, cancelTranslation }
}
