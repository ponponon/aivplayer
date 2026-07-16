import type { SubtitleLanguageId } from '../../../shared/app-settings'
import type { LocaleCopy } from '../../../shared/i18n'

export function formatTranslationLanguageLabel(copy: LocaleCopy, languageId: string | undefined): string {
  if (!languageId) {
    return '—'
  }
  if (languageId === 'auto') {
    return copy.subtitleLanguageOptions.auto.label
  }
  return copy.subtitleLanguageOptions[languageId as SubtitleLanguageId]?.label ?? languageId
}

export function formatTranslationEndpointLabel(value: string | undefined): string {
  return value && value.length > 0 ? value : '—'
}
