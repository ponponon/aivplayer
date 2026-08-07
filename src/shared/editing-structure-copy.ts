import type { AppLocale } from './localization'
import type { MediaStructureSegmentKind } from './media-types'

export type EditingStructureCopy = {
  title: string
  analyze: string
  analyzing: string
  noSegments: string
  cached: string
  jump: string
  ignore: string
  restore: string
  ignored: string
  confidence: (value: number) => string
  kindLabels: Record<MediaStructureSegmentKind, string>
  failed: string
}

const STRUCTURE_COPY: Record<AppLocale, EditingStructureCopy> = {
  'zh-CN': { title: '分析片头 / 片尾 / 黑场', analyze: '开始分析', analyzing: '分析中…', noSegments: '没有检测到明显的片头、片尾或黑场', cached: '已使用本地缓存', jump: '跳转', ignore: '忽略本段', restore: '恢复本段', ignored: '已忽略', confidence: (value) => `置信度 ${Math.round(value * 100)}%`, kindLabels: { intro: '片头黑场', outro: '片尾黑场', black: '黑场' }, failed: '结构分析失败' },
  'en-US': { title: 'Analyze intro / outro / black frames', analyze: 'Analyze', analyzing: 'Analyzing…', noSegments: 'No clear intro, outro, or black sections were detected', cached: 'Loaded from local cache', jump: 'Jump', ignore: 'Ignore section', restore: 'Restore section', ignored: 'Ignored', confidence: (value) => `${Math.round(value * 100)}% confidence`, kindLabels: { intro: 'Intro black', outro: 'Outro black', black: 'Black section' }, failed: 'Structure analysis failed' },
  'ja-JP': { title: 'イントロ / アウトロ / 黒画面を分析', analyze: '分析開始', analyzing: '分析中…', noSegments: '明確なイントロ、アウトロ、黒画面は検出されませんでした', cached: 'ローカルキャッシュを使用', jump: '移動', ignore: 'この区間を無視', restore: '区間を復元', ignored: '無視済み', confidence: (value) => `信頼度 ${Math.round(value * 100)}%`, kindLabels: { intro: 'イントロ黒画面', outro: 'アウトロ黒画面', black: '黒画面' }, failed: '構造分析に失敗しました' },
  'ko-KR': { title: '인트로 / 아웃트로 / 검은 화면 분석', analyze: '분석 시작', analyzing: '분석 중…', noSegments: '뚜렷한 인트로, 아웃트로 또는 검은 구간을 찾지 못했습니다', cached: '로컬 캐시 사용', jump: '이동', ignore: '구간 무시', restore: '구간 복원', ignored: '무시됨', confidence: (value) => `신뢰도 ${Math.round(value * 100)}%`, kindLabels: { intro: '인트로 검은 화면', outro: '아웃트로 검은 화면', black: '검은 구간' }, failed: '구조 분석 실패' }
}

export function getEditingStructureCopy(locale: AppLocale): EditingStructureCopy {
  return STRUCTURE_COPY[locale]
}
