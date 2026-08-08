import { DEFAULT_APP_LOCALE, DEFAULT_SUBTITLE_LANGUAGE, type AppLocale, type SubtitleLanguageId } from './localization.ts'
import { enUS } from './i18n/locales/en-US.ts'
import { jaJP } from './i18n/locales/ja-JP.ts'
import { koKR } from './i18n/locales/ko-KR.ts'
import { zhCN } from './i18n/locales/zh-CN.ts'
import type { LocaleCopy } from './i18n-contract.ts'

export type { LocaleCopy } from './i18n-contract.ts'

const APP_COPY: Record<AppLocale, LocaleCopy> = {
  'zh-CN': zhCN as LocaleCopy,
  'en-US': enUS as LocaleCopy,
  'ja-JP': jaJP as LocaleCopy,
  'ko-KR': koKR as LocaleCopy
}

export function getAppCopy(locale: AppLocale = DEFAULT_APP_LOCALE): LocaleCopy {
  return APP_COPY[locale]
}

export function getDefaultSubtitleLanguage(): SubtitleLanguageId {
  return DEFAULT_SUBTITLE_LANGUAGE
}
