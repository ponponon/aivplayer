import { normalizeTranslationGlossary } from '../../../shared/app-settings'
import { buildAsrModelViewState } from './asr-model-view-state'
import { formatBytes, formatElapsedTime } from './app-helpers'
import type { AppModel } from './app-types'
import { useMediaDerived } from './use-media-derived'
import { useSubtitleDerived } from './use-subtitle-derived'

export function useAppDerived(model: AppModel) {
  const subtitle = useSubtitleDerived(model)
  const media = useMediaDerived(model, subtitle.copy)
  const recommendedModelManifest = model.asrStatus?.recommendedModelManifest ?? null
  const preferredModelSourceId = model.appSettings.asr.preferredModelSourceId
  const recommendedModelSources = recommendedModelManifest ? [...recommendedModelManifest.sources.filter((source) => source.id === preferredModelSourceId), ...recommendedModelManifest.sources.filter((source) => source.id !== preferredModelSourceId)] : []
  const modelViewState = recommendedModelManifest ? buildAsrModelViewState({ copy: subtitle.copy, recommendedManifest: recommendedModelManifest, installedModels: model.asrStatus?.installedModels ?? [], isDownloadingModel: model.isDownloadingModel, downloadProgress: model.downloadProgress, hasWhisperRuntime: Boolean(model.asrStatus?.binaryPath), hasFfmpegRuntime: Boolean(model.asrStatus?.ffmpegPath) }) : null
  const subtitleTranslationGlossary = normalizeTranslationGlossary(model.appSettings.asr.translationGlossary) ?? ''
  const summaryUsesTranslation = Boolean(model.translatedSubtitleResult?.subtitlePath && model.translatedSubtitleResult.targetLanguage === model.appSettings.subtitles.targetLanguage)
  return {
    ...subtitle,
    ...media,
    isSidePanelVisible: model.state.panelMode !== 'none',
    installedModelCount: model.asrStatus?.installedModels.length ?? 0,
    canDownloadRecommendedModel: Boolean(model.asrStatus && !model.isDownloadingModel),
    canGenerateSubtitle: Boolean(model.state.currentFile && model.asrStatus?.available && !model.isAsrBusy && !model.isDownloadingModel && !model.isTranslatingSubtitle),
    canOpenSubtitleTools: Boolean(model.state.currentFile),
    hasCurrentFile: Boolean(model.state.currentFile),
    canOpenSubtitleFolder: Boolean(subtitle.subtitlePath),
    canOpenSubtitleSrt: Boolean(subtitle.subtitleSrtPath),
    canOpenTranslatedSubtitleSrt: Boolean(subtitle.translatedSubtitleSrtPath),
    summarySourcePath: summaryUsesTranslation ? subtitle.translatedSubtitlePath : subtitle.subtitlePath,
    summarySourceLanguage: summaryUsesTranslation ? model.appSettings.subtitles.targetLanguage : subtitle.subtitleTranslationSourceLanguage,
    canGenerateSummary: Boolean(model.state.currentFile && !model.isAsrBusy && !model.isTranslatingSubtitle && !model.isSummarizingSubtitle && !model.isDownloadingModel && (subtitle.subtitlePath || model.asrStatus?.available)),
    hasClipExportSubtitle: Boolean(subtitle.subtitlePath || subtitle.subtitleSrtPath),
    initialSettingsSectionId: model.state.panelMode === 'asr' ? 'subtitles' as const : model.appSettings.ui.lastSettingsSectionId,
    preferredModelSourceId,
    recommendedModelManifest,
    recommendedModelSources,
    modelViewState,
    isControlDeckHidden: Boolean(model.state.currentFile && model.state.isPlaying && model.appSettings.playback.autoHideControlDeck) && !model.isControlDeckVisible,
    asrErrorDetails: model.asrNotice && !model.asrNotice.success ? model.asrNotice.errorDetails : undefined,
    translationServiceStatusLabel: model.translationServiceTestMessage ? model.translationServiceTestMessage.success ? subtitle.copy.asrPanel.translationServiceReady : subtitle.copy.asrPanel.translationServiceUnavailable : subtitle.subtitleTranslationModel ? subtitle.copy.asrPanel.translationServiceNotChecked : null,
    translationServiceStatusTone: model.translationServiceTestMessage ? model.translationServiceTestMessage.success ? 'ready' as const : 'failed' as const : 'pending' as const,
    subtitleTranslationGlossary,
    canQuickSubtitleAction: Boolean(model.state.currentFile && !model.isAsrBusy && !model.isTranslatingSubtitle && !model.isDownloadingModel && !subtitle.isTargetSubtitleReady),
    formatBytes,
    formatElapsedTime
  }
}

export type AppDerived = ReturnType<typeof useAppDerived>
