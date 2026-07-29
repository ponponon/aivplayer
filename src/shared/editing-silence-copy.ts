import type { AppLocale } from './localization'

export type EditingSilenceCopy = {
  label: string
  title: string
  detecting: string
  detectingShort: string
  removed: (count: number, durationSeconds: number) => string
  noSilence: string
  failed: string
}

const formatDuration = (seconds: number): string => `${Math.max(0, seconds).toFixed(1)}s`

const SILENCE_COPY: Record<AppLocale, EditingSilenceCopy> = {
  'zh-CN': { label: '静音', title: '检测并删除静音', detecting: '正在检测静音…', detectingShort: '检测中', removed: (count, seconds) => `已删除 ${count} 段静音（${formatDuration(seconds)}）`, noSilence: '没有检测到可删除的静音片段', failed: '静音检测失败' },
  'en-US': { label: 'Silence', title: 'Detect and remove silence', detecting: 'Detecting silence…', detectingShort: 'Scanning', removed: (count, seconds) => `Removed ${count} silent section${count === 1 ? '' : 's'} (${formatDuration(seconds)})`, noSilence: 'No removable silence was found', failed: 'Silence detection failed' },
  'ja-JP': { label: '無音', title: '無音を検出して削除', detecting: '無音を検出中…', detectingShort: '検出中', removed: (count, seconds) => `${count} 個の無音区間（${formatDuration(seconds)}）を削除しました`, noSilence: '削除できる無音区間はありません', failed: '無音検出に失敗しました' },
  'ko-KR': { label: '무음', title: '무음 감지 및 삭제', detecting: '무음 감지 중…', detectingShort: '감지 중', removed: (count, seconds) => `${count}개 무음 구간(${formatDuration(seconds)})을 삭제했습니다`, noSilence: '삭제할 수 있는 무음 구간이 없습니다', failed: '무음 감지 실패' }
}

export function getEditingSilenceCopy(locale: AppLocale): EditingSilenceCopy {
  return SILENCE_COPY[locale]
}
