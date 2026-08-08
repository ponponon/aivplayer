import type { AppLocale } from './localization'

export type EditingSubtitleCandidateCopy = {
  equivalentCandidatePaths: (paths: string) => string
  distinctCandidatePaths: (paths: string) => string
  detailsLabel: string
  auditSummary: (sourceName: string, kindLabel: string, validPathCount: number, validCandidateCount: number, selectedPath: string) => string
  auditSelected: (sourceName: string, kindLabel: string, selectedPath: string) => string
  auditEquivalent: (sourceName: string, kindLabel: string, paths: string) => string
  auditDistinct: (sourceName: string, kindLabel: string, paths: string) => string
}

const copy: Record<AppLocale, EditingSubtitleCandidateCopy> = {
  'zh-CN': {
    equivalentCandidatePaths: (paths) => `内容相同的候选别名：${paths}`,
    distinctCandidatePaths: (paths) => `内容不同的候选：${paths}`,
    detailsLabel: '查看完整候选路径',
    auditSummary: (sourceName, kindLabel, validPathCount, validCandidateCount, selectedPath) => `字幕候选审计：${sourceName} / ${kindLabel} 有效路径 ${validPathCount} 个，包含 ${validCandidateCount} 种内容，当前使用：${selectedPath}`,
    auditSelected: (sourceName, kindLabel, selectedPath) => `${sourceName} / ${kindLabel} 当前完整路径：${selectedPath}`,
    auditEquivalent: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel} 存在内容相同的候选别名：${paths}`,
    auditDistinct: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel} 存在内容不同的候选，请确认：${paths}`
  },
  'en-US': {
    equivalentCandidatePaths: (paths) => `Equivalent-content aliases: ${paths}`,
    distinctCandidatePaths: (paths) => `Different-content candidates: ${paths}`,
    detailsLabel: 'View full candidate paths',
    auditSummary: (sourceName, kindLabel, validPathCount, validCandidateCount, selectedPath) => `Subtitle candidate audit: ${sourceName} / ${kindLabel} has ${validPathCount} valid paths with ${validCandidateCount} content variant(s); using ${selectedPath}`,
    auditSelected: (sourceName, kindLabel, selectedPath) => `${sourceName} / ${kindLabel} selected full path: ${selectedPath}`,
    auditEquivalent: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel} has equivalent-content aliases: ${paths}`,
    auditDistinct: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel} has different-content candidates; review required: ${paths}`
  },
  'ja-JP': {
    equivalentCandidatePaths: (paths) => `同一内容の候補別名：${paths}`,
    distinctCandidatePaths: (paths) => `内容が異なる候補：${paths}`,
    detailsLabel: '候補の完全なパスを表示',
    auditSummary: (sourceName, kindLabel, validPathCount, validCandidateCount, selectedPath) => `字幕候補監査：${sourceName} / ${kindLabel} は有効パス ${validPathCount} 件、内容は ${validCandidateCount} 種類です。使用中：${selectedPath}`,
    auditSelected: (sourceName, kindLabel, selectedPath) => `${sourceName} / ${kindLabel} 使用中の完全なパス：${selectedPath}`,
    auditEquivalent: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel} に同一内容の候補別名があります：${paths}`,
    auditDistinct: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel} に内容が異なる候補があります。確認してください：${paths}`
  },
  'ko-KR': {
    equivalentCandidatePaths: (paths) => `동일 콘텐츠 후보 별칭: ${paths}`,
    distinctCandidatePaths: (paths) => `콘텐츠가 다른 후보: ${paths}`,
    detailsLabel: '전체 후보 경로 보기',
    auditSummary: (sourceName, kindLabel, validPathCount, validCandidateCount, selectedPath) => `자막 후보 감사: ${sourceName} / ${kindLabel} 유효 경로 ${validPathCount}개, 콘텐츠 ${validCandidateCount}종류; 사용 중: ${selectedPath}`,
    auditSelected: (sourceName, kindLabel, selectedPath) => `${sourceName} / ${kindLabel} 사용 중인 전체 경로: ${selectedPath}`,
    auditEquivalent: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel}에 동일 콘텐츠 후보 별칭이 있습니다: ${paths}`,
    auditDistinct: (sourceName, kindLabel, paths) => `${sourceName} / ${kindLabel}에 다른 콘텐츠 후보가 있습니다. 확인 필요: ${paths}`
  }
}

export function getEditingSubtitleCandidateCopy(locale: AppLocale): EditingSubtitleCandidateCopy {
  return copy[locale] ?? copy['zh-CN']
}
