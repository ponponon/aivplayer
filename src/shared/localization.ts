export const SUPPORTED_APP_LOCALES = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR'] as const
export type AppLocale = (typeof SUPPORTED_APP_LOCALES)[number]

export const DEFAULT_APP_LOCALE: AppLocale = 'zh-CN'

export const SUPPORTED_SUBTITLE_LANGUAGES = ['auto', 'zh', 'en', 'ja', 'ko'] as const
export type SubtitleLanguageId = (typeof SUPPORTED_SUBTITLE_LANGUAGES)[number]

export const DEFAULT_SUBTITLE_LANGUAGE: SubtitleLanguageId = 'auto'

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === 'string' && SUPPORTED_APP_LOCALES.includes(value as AppLocale)
}

export function isSubtitleLanguageId(value: unknown): value is SubtitleLanguageId {
  return typeof value === 'string' && SUPPORTED_SUBTITLE_LANGUAGES.includes(value as SubtitleLanguageId)
}
