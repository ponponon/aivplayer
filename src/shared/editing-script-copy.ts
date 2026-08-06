import type { AppLocale } from './localization'

export type EditingScriptCopy = {
  wordDelete: string
  wordReplace: string
  wordReplacePlaceholder: string
  selectedCount: (count: number) => string
  fillerDelete: string
}

const COPY: Record<AppLocale, EditingScriptCopy> = {
  'zh-CN': {
    wordDelete: '删除词语',
    wordReplace: '替换词语',
    wordReplacePlaceholder: '输入替换词语',
    selectedCount: (count) => `已选择 ${count} 个词语`,
    fillerDelete: '清理填充词'
  },
  'en-US': {
    wordDelete: 'Delete word',
    wordReplace: 'Replace word',
    wordReplacePlaceholder: 'Enter replacement word',
    selectedCount: (count) => `${count} words selected`,
    fillerDelete: 'Remove filler words'
  },
  'ja-JP': {
    wordDelete: '単語を削除',
    wordReplace: '単語を置換',
    wordReplacePlaceholder: '置換後の単語',
    selectedCount: (count) => `${count} 語を選択`,
    fillerDelete: 'フィラーを削除'
  },
  'ko-KR': {
    wordDelete: '단어 삭제',
    wordReplace: '단어 바꾸기',
    wordReplacePlaceholder: '바꿀 단어 입력',
    selectedCount: (count) => `${count}개 단어 선택`,
    fillerDelete: '필러 단어 정리'
  }
}

export function getEditingScriptCopy(locale: AppLocale): EditingScriptCopy {
  return COPY[locale]
}
