import type { AppLocale } from './localization'

export type EditingSceneCopy = {
  split: string
  title: string
  detecting: string
  detectingShort: string
  splitDone: (count: number) => string
  noCuts: string
  failed: string
}

const SCENE_COPY: Record<AppLocale, EditingSceneCopy> = {
  'zh-CN': { split: '场景', title: '自动场景切分', detecting: '正在检测场景…', detectingShort: '检测中', splitDone: (count) => `已按 ${count} 个场景切点分割`, noCuts: '当前片段没有检测到合适的场景切点', failed: '场景检测失败' },
  'en-US': { split: 'Scene', title: 'Auto scene split', detecting: 'Detecting scenes…', detectingShort: 'Scanning', splitDone: (count) => `Split at ${count} scene cut${count === 1 ? '' : 's'}`, noCuts: 'No suitable scene cuts found in this clip', failed: 'Scene detection failed' },
  'ja-JP': { split: 'シーン', title: '自動シーン分割', detecting: 'シーンを検出中…', detectingShort: '検出中', splitDone: (count) => `${count} 個のシーン切り替えで分割しました`, noCuts: 'このクリップに適切なシーン切り替えはありません', failed: 'シーン検出に失敗しました' },
  'ko-KR': { split: '장면', title: '자동 장면 분할', detecting: '장면 감지 중…', detectingShort: '감지 중', splitDone: (count) => `${count}개 장면 전환 지점으로 분할했습니다`, noCuts: '이 클립에서 적절한 장면 전환을 찾지 못했습니다', failed: '장면 감지 실패' }
}

export function getEditingSceneCopy(locale: AppLocale): EditingSceneCopy {
  return SCENE_COPY[locale]
}
