import { describe, expect, it } from 'vitest'
import { formatDramaChapterText, parseDramaChapters } from '../../src/core/drama/drama-text'

describe('drama text import', () => {
  it('parses Chinese chapter headings and volume headings', () => {
    const chapters = parseDramaChapters('第1卷\n第1章 雨夜\n主角在雨中收到一封信。\n\n第2章 追踪\n他开始追查寄信人。')

    expect(chapters).toHaveLength(2)
    expect(chapters[0]).toMatchObject({ chapterIndex: 1, volume: '第1卷', title: '雨夜', content: '主角在雨中收到一封信。' })
    expect(chapters[1]).toMatchObject({ chapterIndex: 2, volume: '第1卷', title: '追踪', content: '他开始追查寄信人。' })
  })

  it('supports English headings and plain text fallback', () => {
    expect(parseDramaChapters('Chapter 1: Arrival\nA stranger arrives.')).toMatchObject([
      { chapterIndex: 1, title: 'Arrival', content: 'A stranger arrives.' }
    ])
    expect(parseDramaChapters('Only one piece of prose.')).toEqual([
      { chapterIndex: 1, volume: '', title: '正文', content: 'Only one piece of prose.' }
    ])
  })

  it('formats imported chapters back to readable text', () => {
    expect(formatDramaChapterText(parseDramaChapters('第1章 开始\n故事开始。'))).toBe('开始\n\n故事开始。')
  })
})
