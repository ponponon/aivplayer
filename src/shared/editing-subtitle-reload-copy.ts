import type { AppLocale } from './localization'

export type EditingSubtitleReloadCopy = {
  title: string
  description: string
  preview: string
  changed: (count: number) => string
  added: (count: number) => string
  removed: (count: number) => string
  current: string
  incoming: string
  empty: string
  source: string
  translation: string
  keep: string
  force: string
  changedLabel: string
  addedLabel: string
  removedLabel: string
}

const copy: Record<AppLocale, EditingSubtitleReloadCopy> = {
  'zh-CN': {
    title: '检测到字幕版本变化',
    description: '正式字幕文件已经更新。为避免覆盖你的脚本编辑，当前字幕轨和脚本暂时保持不变，请先查看差异并选择处理方式。',
    preview: '查看冲突预览',
    changed: (count) => `${count} 处修改`,
    added: (count) => `${count} 条新增`,
    removed: (count) => `${count} 条删除`,
    current: '当前编辑',
    incoming: '新字幕',
    empty: '（无内容）',
    source: '原文',
    translation: '译文',
    keep: '保留当前编辑',
    force: '强制重载字幕',
    changedLabel: '修改',
    addedLabel: '新增',
    removedLabel: '删除'
  },
  'en-US': {
    title: 'Subtitle version changed',
    description: 'The formal subtitle files changed. Your current caption track and script stay untouched until you review the differences and choose an action.',
    preview: 'Review conflict preview',
    changed: (count) => `${count} changed`,
    added: (count) => `${count} added`,
    removed: (count) => `${count} removed`,
    current: 'Current edit',
    incoming: 'New subtitle',
    empty: '(empty)',
    source: 'Source',
    translation: 'Translation',
    keep: 'Keep current edit',
    force: 'Force reload subtitles',
    changedLabel: 'Changed',
    addedLabel: 'Added',
    removedLabel: 'Removed'
  },
  'ja-JP': {
    title: '字幕のバージョンが変わりました',
    description: '正式な字幕ファイルが更新されました。差分を確認して選択するまで、現在の字幕トラックとスクリプト編集は保持されます。',
    preview: '競合を確認',
    changed: (count) => `${count} 件変更`,
    added: (count) => `${count} 件追加`,
    removed: (count) => `${count} 件削除`,
    current: '現在の編集',
    incoming: '新しい字幕',
    empty: '（空）',
    source: '原文',
    translation: '翻訳',
    keep: '現在の編集を保持',
    force: '字幕を強制再読み込み',
    changedLabel: '変更',
    addedLabel: '追加',
    removedLabel: '削除'
  },
  'ko-KR': {
    title: '자막 버전이 변경되었습니다',
    description: '공식 자막 파일이 업데이트되었습니다. 차이를 확인하고 선택할 때까지 현재 자막 트랙과 스크립트 편집은 유지됩니다.',
    preview: '충돌 미리보기 확인',
    changed: (count) => `${count}개 변경`,
    added: (count) => `${count}개 추가`,
    removed: (count) => `${count}개 삭제`,
    current: '현재 편집',
    incoming: '새 자막',
    empty: '(비어 있음)',
    source: '원문',
    translation: '번역',
    keep: '현재 편집 유지',
    force: '자막 강제 다시 불러오기',
    changedLabel: '변경',
    addedLabel: '추가',
    removedLabel: '삭제'
  }
}

export function getEditingSubtitleReloadCopy(locale: AppLocale): EditingSubtitleReloadCopy {
  return copy[locale] ?? copy['zh-CN']
}
