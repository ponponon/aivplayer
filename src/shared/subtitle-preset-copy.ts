import type { AppLocale } from './localization'
import type { SubtitleEmphasisMode, SubtitlePresetId } from './subtitle-presets'

export type SubtitlePresetCopy = {
  preset: string
  emphasis: string
  keywords: string
  keywordsPlaceholder: string
  emphasisOptions: Record<SubtitleEmphasisMode, string>
  presetNames: Record<SubtitlePresetId, string>
}

const COPY: Record<AppLocale, SubtitlePresetCopy> = {
  'zh-CN': {
    preset: '字幕风格',
    emphasis: '重点词',
    keywords: '关键词',
    keywordsPlaceholder: '用逗号分隔，例如：关键、重要、AI',
    emphasisOptions: { none: '关闭', keywords: '关键词', words: '逐词高亮' },
    presetNames: { clean: '清爽', yellow: '暖黄', mint: '薄荷', navy: '深蓝', 'serif-gold': '金色衬线' }
  },
  'en-US': {
    preset: 'Caption style',
    emphasis: 'Emphasis',
    keywords: 'Keywords',
    keywordsPlaceholder: 'Comma-separated, e.g. key, important, AI',
    emphasisOptions: { none: 'Off', keywords: 'Keywords', words: 'Word timing' },
    presetNames: { clean: 'Clean', yellow: 'Warm', mint: 'Mint', navy: 'Navy', 'serif-gold': 'Gold serif' }
  },
  'ja-JP': {
    preset: '字幕スタイル',
    emphasis: '強調',
    keywords: 'キーワード',
    keywordsPlaceholder: 'カンマ区切り：重要、AI など',
    emphasisOptions: { none: 'なし', keywords: 'キーワード', words: '単語タイミング' },
    presetNames: { clean: 'シンプル', yellow: 'ウォーム', mint: 'ミント', navy: 'ネイビー', 'serif-gold': '金色セリフ' }
  },
  'ko-KR': {
    preset: '자막 스타일',
    emphasis: '강조',
    keywords: '키워드',
    keywordsPlaceholder: '쉼표로 구분: 중요, AI 등',
    emphasisOptions: { none: '없음', keywords: '키워드', words: '단어 타이밍' },
    presetNames: { clean: '깔끔', yellow: '웜', mint: '민트', navy: '네이비', 'serif-gold': '골드 세리프' }
  }
}

export function getSubtitlePresetCopy(locale: AppLocale): SubtitlePresetCopy {
  return COPY[locale]
}
