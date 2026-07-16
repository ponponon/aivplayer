import { useEffect } from 'react'
import type { AppSettings } from '../../../shared/app-settings'
import type { AsrSubtitleTranslationResult } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

type DisplayPatcher = (patch: Partial<AppSettings['subtitles']>) => void

export function useSubtitleCacheEffects(model: AppModel, derived: AppDerived, patchDisplay: DisplayPatcher): void {
  const matchesCurrentContext = (result: AsrSubtitleTranslationResult | null): boolean => {
    if (!result?.subtitleUrl || result.sourceSubtitlePath !== derived.subtitlePath) return false
    if ((result.sourceLanguage ?? 'auto') !== derived.subtitleTranslationSourceLanguage) return false
    if (result.targetLanguage !== model.appSettings.subtitles.targetLanguage) return false
    if (derived.subtitleTranslationModel && (result.translationModel ?? '') !== derived.subtitleTranslationModel) return false
    return (result.translationGlossary ?? '') === derived.subtitleTranslationGlossary
  }

  useEffect(() => {
    const currentFilePath = model.state.currentFile?.path
    const modelId = model.asrStatus?.recommendedModelManifest.id
    if (!currentFilePath || !modelId || !model.appSettings.asr.autoLoadCachedSubtitles) return
    let cancelled = false
    void window.aiv.resolveAsrSubtitleCache({ mediaPath: currentFilePath, modelId }).then((result) => {
      if (cancelled || !result.success || !result.subtitleUrl) return
      model.setActiveSubtitle(result)
      model.setSubtitleResult(result)
      model.setAsrNotice(result)
      model.setAsrProgress(null)
    })
    return () => { cancelled = true }
  }, [model.state.currentFile?.path, model.asrStatus?.recommendedModelManifest.id, model.appSettings.asr.autoLoadCachedSubtitles])

  useEffect(() => {
    if (model.translatedSubtitleResult?.subtitleUrl && !matchesCurrentContext(model.translatedSubtitleResult)) model.setTranslatedSubtitleResult(null)
  }, [model.translatedSubtitleResult?.subtitleUrl, model.translatedSubtitleResult?.sourceSubtitlePath, model.translatedSubtitleResult?.targetLanguage, derived.subtitlePath, derived.subtitleTranslationSourceLanguage, derived.subtitleTranslationModel, derived.subtitleTranslationGlossary, model.appSettings.subtitles.targetLanguage])

  useEffect(() => {
    if (!model.state.currentFile || !derived.subtitlePath || !model.appSettings.asr.autoLoadCachedSubtitles || model.isTranslatingSubtitle || matchesCurrentContext(model.translatedSubtitleResult)) return
    let cancelled = false
    void window.aiv.resolveTranslatedAsrSubtitleCache({
      subtitlePath: derived.subtitlePath,
      subtitleSrtPath: derived.subtitleSrtPath ?? undefined,
      sourceLanguage: derived.subtitleTranslationSourceLanguage,
      targetLanguage: model.appSettings.subtitles.targetLanguage
    }).then((result) => {
      if (cancelled || !result.success || !result.subtitleUrl) return
      model.setTranslatedSubtitleResult(result)
      if (model.appSettings.subtitles.displayMode === 'source') patchDisplay({ displayMode: 'translation' })
    })
    return () => { cancelled = true }
  }, [model.state.currentFile?.path, derived.subtitlePath, derived.subtitleSrtPath, derived.subtitleTranslationSourceLanguage, derived.subtitleTranslationModel, derived.subtitleTranslationGlossary, model.appSettings.asr.autoLoadCachedSubtitles, model.appSettings.subtitles.targetLanguage, model.appSettings.subtitles.displayMode, model.isTranslatingSubtitle, model.translatedSubtitleResult?.subtitleUrl])

  useEffect(() => {
    const sourcePath = derived.summarySourcePath
    if (!model.state.currentFile || !sourcePath || !model.appSettings.asr.autoLoadCachedSubtitles || model.isSummarizingSubtitle) return
    const sourceLanguage = derived.summarySourceLanguage
    const current = model.subtitleSummaryResult
    if (current?.summary && (current.sourceSubtitlePath !== sourcePath || current.targetLanguage !== model.appSettings.subtitles.targetLanguage || current.summaryModel !== derived.subtitleTranslationModel || (current.mode ?? 'detailed') !== model.summaryMode)) {
      model.setSubtitleSummaryResult(null)
      model.setSummaryNotice(null)
      return
    }
    if (current?.success && current.sourceSubtitlePath === sourcePath && current.targetLanguage === model.appSettings.subtitles.targetLanguage && (current.mode ?? 'detailed') === model.summaryMode) return
    let cancelled = false
    void window.aiv.resolveAsrSubtitleSummaryCache({ subtitlePath: sourcePath, sourceLanguage, targetLanguage: model.appSettings.subtitles.targetLanguage, mode: model.summaryMode }).then((result) => {
      if (cancelled || !result.success || !result.summary) return
      model.setSubtitleSummaryResult(result)
      model.setSummaryNotice(result)
    })
    return () => { cancelled = true }
  }, [model.state.currentFile?.path, derived.summarySourcePath, derived.summarySourceLanguage, derived.subtitleTranslationModel, model.appSettings.asr.autoLoadCachedSubtitles, model.appSettings.subtitles.targetLanguage, model.summaryMode, model.isSummarizingSubtitle, model.subtitleSummaryResult?.sourceSubtitlePath, model.subtitleSummaryResult?.summaryModel, model.subtitleSummaryResult?.mode])
}
