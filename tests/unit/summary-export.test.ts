import { describe, expect, it } from 'vitest'
import type { AsrSubtitleSummary } from '../../src/shared/media-types'
import { formatSummaryExport, type SummaryExportMeta } from '../../src/shared/summary-export'

const summary: AsrSubtitleSummary = {
  title: '夜航',
  overview: '一名记者追查失踪案。',
  synopsis: '记者从一张旧照片开始调查。',
  keyPoints: ['发现线索'],
  characters: [{ name: '林遥', role: '记者' }],
  themes: ['选择'],
  chapters: [{ title: '调查开始', timeSeconds: 62, summary: '记者发现关键线索。' }],
  ending: '案件真相被公开。'
}

const meta: SummaryExportMeta = {
  targetLanguage: 'zh',
  targetLanguageLabel: '中文',
  mode: 'quick',
  labels: {
    overviewTitle: '内容概览',
    synopsisTitle: '剧情梗概',
    chaptersTitle: '剧情章节',
    keyPointsTitle: '关键事件与看点',
    charactersTitle: '重要人物',
    themesTitle: '主题',
    endingTitle: '结局提示',
    outputLanguageLabel: '输出语言',
    modeLabel: '总结模式',
    quickModeLabel: '快速了解',
    detailedModeLabel: '详细解说'
  }
}

describe('summary export', () => {
  it('formats a spoiler-safe quick summary as plain text and markdown', () => {
    const text = formatSummaryExport(summary, 'txt', meta)
    const markdown = formatSummaryExport(summary, 'markdown', meta)

    expect(text).toContain('01:02 · 调查开始：记者发现关键线索。')
    expect(text).not.toContain('案件真相被公开。')
    expect(markdown).toContain('## 剧情章节')
    expect(markdown).toContain('**01:02 · 调查开始**')
    expect(markdown).not.toContain('结局提示')
  })

  it('keeps structured metadata in JSON export', () => {
    const parsed = JSON.parse(formatSummaryExport(summary, 'json', meta)) as { mode: string; targetLanguage: string; summary: AsrSubtitleSummary }

    expect(parsed).toMatchObject({ mode: 'quick', targetLanguage: 'zh' })
    expect(parsed.summary.chapters[0]).toMatchObject({ title: '调查开始', timeSeconds: 62 })
  })
})
