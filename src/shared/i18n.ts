import { DEFAULT_APP_LOCALE, DEFAULT_SUBTITLE_LANGUAGE, type AppLocale, type SubtitleLanguageId } from './localization.ts'
import { enUS } from './i18n/locales/en-US'
import { jaJP } from './i18n/locales/ja-JP'
import { koKR } from './i18n/locales/ko-KR'
import { zhCN } from './i18n/locales/zh-CN'
import type { LocaleCopy } from './i18n-contract'

export type { LocaleCopy } from './i18n-contract'

const APP_COPY: Record<AppLocale, LocaleCopy> = {
  'zh-CN': zhCN,
  'en-US': enUS,
  'ja-JP': jaJP,
  'ko-KR': koKR
}

export function getAppCopy(locale: AppLocale = DEFAULT_APP_LOCALE): LocaleCopy {
  return APP_COPY[locale]
}

export function getDefaultSubtitleLanguage(): SubtitleLanguageId {
  return DEFAULT_SUBTITLE_LANGUAGE
}
