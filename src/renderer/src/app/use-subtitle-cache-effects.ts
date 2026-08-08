import { useEffect } from 'react'
import type { AppSettings } from '../../../shared/app-settings'
import type { AsrSubtitleTranslationResult } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

type DisplayPatcher = (patch: Partial<AppSettings['subtitles']>) => void

export function useSubtitleCacheEffects(model: AppModel, derived: AppDerived, patchDisplay: DisplayPatcher): void {
  const isPriorityWindowActive = (startSeconds: number | undefined, endSeconds: number | undefined): boolean =>
    startSeconds !== undefined && endSeconds !== undefined && model.state.currentTime >= startSeconds && model.state.currentTime <= endSeconds

  const matchesCurrentContext = (result: AsrSubtitleTranslationResult | null): boolean => {
    if (!result?.subtitleUrl || result.sourceSubtitlePath !== derived.subtitlePath) return false
    if ((result.sourceLanguage ?? 'auto') !== derived.subtitleTranslationSourceLanguage) return false
    if (result.targetLanguage !== model.appSettings.subtitles.targetLanguage) return false
    if (derived.subtitleTranslationModel && (result.translationModel ?? '') !== derived.subtitleTranslationModel) return false
    return (result.translationGlossary ?? '') === derived.subtitleTranslationGlossary
  }

  useEffect(() => {
    const progress = model.asrProgress
    if (!model.isAsrBusy || !model.state.currentFile || progress?.mediaPath !== model.state.currentFile.path) return

    const usePrioritySubtitle = isPriorityWindowActive(progress.priorityStartSeconds, progress.priorityEndSeconds) && Boolean(progress.prioritySubtitlePath)
    const subtitlePath = usePrioritySubtitle ? progress.prioritySubtitlePath : progress.partialSubtitlePath
    if (!subtitlePath) {
      model.setActiveSubtitle(null)
      model.setSubtitleResult(null)
      return
    }

    const partialResult = {
      success: true,
      message: progress.message,
      subtitlePath,
      subtitleSrtPath: usePrioritySubtitle ? progress.prioritySubtitleSrtPath : progress.partialSubtitleSrtPath,
      subtitleRevision: usePrioritySubtitle ? progress.prioritySubtitleRevision ?? 0 : progress.partialSubtitleRevision ?? 0
    }
    model.setActiveSubtitle(partialResult)
    model.setSubtitleResult(partialResult)
  }, [model.asrProgress?.mediaPath, model.asrProgress?.partialSubtitlePath, model.asrProgress?.partialSubtitleRevision, model.asrProgress?.prioritySubtitlePath, model.asrProgress?.prioritySubtitleRevision, model.asrProgress?.priorityStartSeconds, model.asrProgress?.priorityEndSeconds, model.state.currentFile?.path, model.state.currentTime, model.isAsrBusy])

  useEffect(() => {
    const progress = model.asrProgress
    if (!model.isAsrBusy || !model.state.currentFile || progress?.mediaPath !== model.state.currentFile.path) return

    const usePriorityTranslation = isPriorityWindowActive(progress.priorityStartSeconds, progress.priorityEndSeconds) && Boolean(progress.priorityTranslatedSubtitlePath)
    const subtitlePath = usePriorityTranslation ? progress.priorityTranslatedSubtitlePath : progress.partialTranslatedSubtitlePath
    const targetLanguage = usePriorityTranslation ? progress.priorityTranslationTargetLanguage : progress.partialTranslationTargetLanguage
    if (!subtitlePath || !targetLanguage) {
      model.setTranslatedSubtitleResult(null)
      return
    }

    model.setTranslatedSubtitleResult({
      success: true,
      partial: true,
      message: progress.message,
      sourceSubtitlePath: usePriorityTranslation ? progress.priorityTranslationSourcePath : progress.partialTranslationSourcePath ?? derived.subtitlePath ?? undefined,
      sourceLanguage: usePriorityTranslation ? progress.priorityTranslationSourceLanguage : progress.partialTranslationSourceLanguage,
      targetLanguage,
      subtitlePath,
      subtitleSrtPath: usePriorityTranslation ? progress.priorityTranslatedSubtitleSrtPath : progress.partialTranslatedSubtitleSrtPath,
      subtitleRevision: usePriorityTranslation ? progress.priorityTranslatedSubtitleRevision ?? 0 : progress.partialTranslatedSubtitleRevision ?? 0
    })
    if (model.appSettings.subtitles.displayMode === 'source') patchDisplay({ displayMode: 'translation' })
  }, [model.asrProgress?.mediaPath, model.asrProgress?.partialTranslatedSubtitlePath, model.asrProgress?.partialTranslatedSubtitleRevision, model.asrProgress?.partialTranslationSourceLanguage, model.asrProgress?.partialTranslationTargetLanguage, model.asrProgress?.partialTranslationSourcePath, model.asrProgress?.priorityTranslatedSubtitlePath, model.asrProgress?.priorityTranslatedSubtitleRevision, model.asrProgress?.priorityTranslationSourceLanguage, model.asrProgress?.priorityTranslationTargetLanguage, model.asrProgress?.priorityTranslationSourcePath, model.asrProgress?.priorityStartSeconds, model.asrProgress?.priorityEndSeconds, model.state.currentFile?.path, model.state.currentTime, model.isAsrBusy, derived.subtitlePath])

  useEffect(() => {
    const currentFilePath = model.state.currentFile?.path
    if (!currentFilePath || !model.appSettings.asr.autoLoadCachedSubtitles) return
    let cancelled = false
    const restoreSubtitle = async (): Promise<void> => {
      const sidecar = await window.aiv.resolveMediaSubtitleSidecar({ mediaPath: currentFilePath }).catch(() => null)
      if (cancelled) return
      if (sidecar?.success && sidecar.subtitleUrl) {
        model.setActiveSubtitle(sidecar)
        model.setSubtitleResult(sidecar)
        model.setAsrNotice(sidecar)
        model.setAsrProgress(null)
        return
      }
      if (sidecar?.errorDetails?.code === 'INVALID_SUBTITLE_SIDECAR') {
        model.setAsrNotice(sidecar)
        model.setAsrProgress(null)
        return
      }

      const modelId = model.asrStatus?.recommendedModelManifest.id
      if (!modelId) return
      const result = await window.aiv.resolveAsrSubtitleCache({ mediaPath: currentFilePath, modelId })
      if (cancelled || !result.success || !result.subtitleUrl) return
      model.setActiveSubtitle(result)
      model.setSubtitleResult(result)
      model.setAsrNotice(result)
      model.setAsrProgress(null)
    }
    void restoreSubtitle()
    return () => { cancelled = true }
  }, [model.state.currentFile?.path, model.asrStatus?.recommendedModelManifest.id, model.appSettings.asr.autoLoadCachedSubtitles])

  useEffect(() => {
    if (model.translatedSubtitleResult?.subtitleUrl && !matchesCurrentContext(model.translatedSubtitleResult)) model.setTranslatedSubtitleResult(null)
  }, [model.translatedSubtitleResult?.subtitleUrl, model.translatedSubtitleResult?.sourceSubtitlePath, model.translatedSubtitleResult?.targetLanguage, derived.subtitlePath, derived.subtitleTranslationSourceLanguage, derived.subtitleTranslationModel, derived.subtitleTranslationGlossary, model.appSettings.subtitles.targetLanguage])

  useEffect(() => {
    if (!model.state.currentFile || !derived.subtitlePath || !model.appSettings.asr.autoLoadCachedSubtitles || model.isTranslatingSubtitle || matchesCurrentContext(model.translatedSubtitleResult)) return
    let cancelled = false
    void window.aiv.resolveTranslatedAsrSubtitleCache({
      mediaPath: model.state.currentFile.path,
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
    const currentSourceType = current?.sourceType ?? 'raw'
    const currentContextMatches = Boolean(current?.summary && current.targetLanguage === model.appSettings.subtitles.targetLanguage && current.summaryModel === derived.subtitleTranslationModel && (current.mode ?? 'detailed') === model.summaryMode)
    const currentSourceIsAvailable = currentSourceType === 'translated'
      ? current?.sourceSubtitlePath === model.translatedSubtitleResult?.subtitlePath
      : current?.sourceSubtitlePath === derived.subtitlePath
    if (currentContextMatches && currentSourceIsAvailable) return
    if (current?.summary && currentContextMatches && !currentSourceIsAvailable) {
      model.setSubtitleSummaryResult(null)
      model.setSummaryNotice(null)
      return
    }
    if (current?.summary && (current.targetLanguage !== model.appSettings.subtitles.targetLanguage || current.summaryModel !== derived.subtitleTranslationModel || (current.mode ?? 'detailed') !== model.summaryMode)) {
      model.setSubtitleSummaryResult(null)
      model.setSummaryNotice(null)
      return
    }
    if (current?.success && current.sourceSubtitlePath === sourcePath && current.targetLanguage === model.appSettings.subtitles.targetLanguage && (current.mode ?? 'detailed') === model.summaryMode) return
    let cancelled = false
    void window.aiv.resolveAsrSubtitleSummaryCache({ mediaPath: model.state.currentFile.path, subtitlePath: sourcePath, sourceLanguage, sourceType: derived.summarySourceType, targetLanguage: model.appSettings.subtitles.targetLanguage, mode: model.summaryMode }).then((result) => {
      if (cancelled || !result.success || !result.summary) return
      model.setSubtitleSummaryResult(result)
      model.setSummaryNotice(result)
    })
    return () => { cancelled = true }
  }, [model.state.currentFile?.path, derived.summarySourcePath, derived.summarySourceLanguage, derived.subtitleTranslationModel, model.appSettings.asr.autoLoadCachedSubtitles, model.appSettings.subtitles.targetLanguage, model.summaryMode, model.isSummarizingSubtitle, model.subtitleSummaryResult?.sourceSubtitlePath, model.subtitleSummaryResult?.summaryModel, model.subtitleSummaryResult?.mode])
}
