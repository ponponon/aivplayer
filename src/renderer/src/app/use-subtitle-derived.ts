import { getAppCopy } from '../../../shared/i18n'
import { normalizeTranslationGlossary } from '../../../shared/app-settings'
import { formatSubtitleLanguageLabel, isSubtitleLanguageMatch, subtitleTargetLanguageIds } from './app-helpers'
import type { AppModel } from './app-types'

export function useSubtitleDerived(model: AppModel) {
  const copy = getAppCopy(model.appSettings.ui.locale)
  const subtitlePath = model.activeSubtitle?.subtitlePath ?? model.subtitleResult?.subtitlePath ?? null
  const subtitleSrtPath = model.activeSubtitle?.subtitleSrtPath ?? model.subtitleResult?.subtitleSrtPath ?? null
  const translatedSubtitlePath = model.translatedSubtitleResult?.subtitlePath ?? null
  const translatedSubtitleSrtPath = model.translatedSubtitleResult?.subtitleSrtPath ?? null
  const subtitleTargetLanguageLabel = copy.subtitleLanguageOptions[model.appSettings.subtitles.targetLanguage].label
  const subtitleSourceLanguage = model.activeSubtitle?.subtitleLanguage ?? model.subtitleResult?.subtitleLanguage ?? null
  const subtitleSourceLanguageLabel = formatSubtitleLanguageLabel(copy, subtitleSourceLanguage)
  const subtitleTranslationSourceLanguage = subtitleSourceLanguage ?? model.appSettings.asr.defaultSubtitleLanguage
  const subtitleTranslationModel = model.appSettings.asr.translationModel?.trim() ?? ''
  const subtitleTranslationGlossary = normalizeTranslationGlossary(model.appSettings.asr.translationGlossary) ?? ''
  const subtitleLanguagePairLabel = subtitleSourceLanguageLabel ? `${subtitleSourceLanguageLabel} → ${subtitleTargetLanguageLabel}` : null
  const subtitleTranslationModelLabel = model.translatedSubtitleResult?.translationModel ?? subtitleTranslationModel
  const translatedSubtitleReadyLabel = model.translatedSubtitleResult?.subtitleUrl ? copy.asrPanel.translatedSubtitleReady : null
  const subtitleStatusLabel = model.activeSubtitle?.subtitleUrl ? copy.panels.subtitleStatusReady : subtitlePath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle
  const targetLanguage = model.appSettings.subtitles.targetLanguage
  const isTargetSourceSubtitle = Boolean(subtitlePath && isSubtitleLanguageMatch(subtitleSourceLanguage, targetLanguage))
  const isTargetTranslationReady = Boolean(model.translatedSubtitleResult?.success && model.translatedSubtitleResult.targetLanguage === targetLanguage && (model.translatedSubtitleResult.subtitlePath || model.translatedSubtitleResult.subtitleUrl))
  const isTargetSubtitleReady = isTargetSourceSubtitle || isTargetTranslationReady
  const quickSubtitleLabel = model.isAsrBusy
    ? copy.quickSubtitle.generating(subtitleTargetLanguageLabel)
    : model.isTranslatingSubtitle
      ? copy.quickSubtitle.translating(subtitleTargetLanguageLabel)
      : isTargetSubtitleReady
        ? copy.quickSubtitle.ready(subtitleTargetLanguageLabel)
        : !model.asrStatus
          ? copy.quickSubtitle.detecting
          : !model.asrStatus.available
            ? copy.quickSubtitle.setup
            : subtitlePath
              ? copy.quickSubtitle.translate(subtitleTargetLanguageLabel)
              : copy.quickSubtitle.generate(subtitleTargetLanguageLabel)
  return {
    copy,
    subtitlePath,
    subtitleSrtPath,
    translatedSubtitlePath,
    translatedSubtitleSrtPath,
    canTranslateSubtitle: Boolean(subtitlePath && !model.isAsrBusy && !model.isTranslatingSubtitle),
    subtitleTargetLanguageLabel,
    subtitleSourceLanguage,
    subtitleSourceLanguageLabel,
    subtitleTranslationSourceLanguage,
    subtitleTranslationModel,
    subtitleTranslationGlossary,
    subtitleLanguagePairLabel,
    subtitleTranslationModelLabel,
    translatedSubtitleReadyLabel,
    subtitleStatusLabel,
    isTargetSourceSubtitle,
    isTargetTranslationReady,
    isTargetSubtitleReady,
    quickSubtitleLabel,
    quickTargetLanguage: targetLanguage,
    subtitleTargetLanguageIds
  }
}
