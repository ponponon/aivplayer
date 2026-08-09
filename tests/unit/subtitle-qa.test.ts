import { describe, expect, it } from 'vitest'
import type { EditingCaption } from '../../src/shared/editing-types'
import { analyzeSubtitleQa, repairSubtitleQaIssues } from '../../src/shared/subtitle-qa'

function caption(id: string, startSeconds: number, durationSeconds: number, text: string, kind: EditingCaption['kind'] = 'source'): EditingCaption {
  return { id, startSeconds, durationSeconds, text, kind }
}

describe('subtitle QA analyzer', () => {
  it('finds content, timing, reading-speed, layout, punctuation and recognition issues', () => {
    const issues = analyzeSubtitleQa([
      caption('empty', 0, 1, '   '),
      caption('short', 1, 0.2, '短句'),
      caption('long', 2, 8, '正常句子'),
      caption('cps', 10, 1, '这是一个会导致阅读速度过快的字幕句子'),
      caption('wide', 12, 1, '这是一个非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常非常长的字幕行'),
      caption('punctuation', 14, 1, '你好 !!!'),
      caption('recognition', 16, 1, 'um um �')
    ])

    expect(new Set(issues.map((item) => item.kind))).toEqual(new Set([
      'empty', 'too-short', 'too-long', 'high-cps', 'wide-line', 'punctuation', 'recognition'
    ]))
    expect(issues.find((item) => item.kind === 'empty')).toMatchObject({ captionId: 'empty', severity: 'error' })
    expect(issues.find((item) => item.kind === 'high-cps')?.value).toBeGreaterThan(17)
    expect(issues.find((item) => item.kind === 'wide-line')?.value).toBeGreaterThan(32)
  })

  it('detects same-track overlap but does not treat bilingual rows as overlap', () => {
    const issues = analyzeSubtitleQa([
      caption('source-a', 0, 2, 'source A', 'source'),
      caption('source-b', 1.5, 1, 'source B', 'source'),
      caption('translation-a', 0, 2, 'translation A', 'translation'),
      caption('translation-b', 1.5, 1, 'translation B', 'translation')
    ])

    expect(issues.filter((item) => item.kind === 'overlap')).toEqual([
      expect.objectContaining({ captionId: 'source-b', relatedCaptionId: 'source-a', value: 0.5 }),
      expect.objectContaining({ captionId: 'translation-b', relatedCaptionId: 'translation-a', value: 0.5 })
    ])
  })

  it('allows source and translation tracks to share identical timing', () => {
    const issues = analyzeSubtitleQa([
      caption('source', 0, 2, 'source', 'source'),
      caption('translation', 0, 2, 'translation', 'translation')
    ])

    expect(issues.filter((item) => item.kind === 'overlap')).toEqual([])
  })

  it('sorts findings deterministically and respects custom thresholds', () => {
    const captions = [
      caption('later', 3, 0.8, 'later'),
      caption('earlier', 1, 0.8, 'earlier')
    ]
    const first = analyzeSubtitleQa(captions, { minDurationSeconds: 1, maxCharactersPerSecond: 4 })
    const second = analyzeSubtitleQa([...captions].reverse(), { minDurationSeconds: 1, maxCharactersPerSecond: 4 })

    expect(first).toEqual(second)
    expect(first.map((item) => `${item.captionId}:${item.kind}`)).toEqual([
      'earlier:high-cps', 'earlier:too-short', 'later:high-cps', 'later:too-short'
    ])
  })

  it('does not mutate captions and ignores whitespace in CPS', () => {
    const source = [caption('stable', 0, 1, 'a   b')]
    const before = structuredClone(source)

    expect(analyzeSubtitleQa(source, { maxCharactersPerSecond: 3 })).toEqual([])
    expect(source).toEqual(before)
  })

  it('repairs selected timing issues without rewriting text or source anchors', () => {
    const source: EditingCaption[] = [
      { ...caption('short', 0, 0.2, '短句'), sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 0.2 },
      caption('overlap-a', 2, 2, '前一句'),
      caption('overlap-b', 3, 1, '后一句'),
      caption('long', 5, 9, '长句')
    ]
    const issues = analyzeSubtitleQa(source, { minDurationSeconds: 0.4, maxDurationSeconds: 7 })
    const repaired = repairSubtitleQaIssues(source, issues, 20, { minDurationSeconds: 0.4, maxDurationSeconds: 7 })

    expect(repaired.find((item) => item.id === 'short')).toMatchObject({ durationSeconds: 0.4, text: '短句' })
    expect(repaired.find((item) => item.id === 'short')).not.toHaveProperty('sourceId')
    expect(repaired.find((item) => item.id === 'overlap-a')).toMatchObject({ startSeconds: 2, durationSeconds: 1 })
    expect(repaired.find((item) => item.id === 'long')).toMatchObject({ startSeconds: 5, durationSeconds: 7 })
    expect(repaired.find((item) => item.id === 'overlap-b')?.text).toBe('后一句')
    expect(source[0]?.durationSeconds).toBe(0.2)
  })

  it('does not extend a short cue into the next cue and leaves text issues untouched', () => {
    const source = [caption('short', 0, 0.2, '短句'), caption('next', 0.3, 1, '下一句'), caption('text', 2, 1, '你好 !!!')]
    const issues = analyzeSubtitleQa(source, { minDurationSeconds: 0.4 })
    const repaired = repairSubtitleQaIssues(source, issues, 5, { minDurationSeconds: 0.4 })

    expect(repaired.find((item) => item.id === 'short')?.durationSeconds).toBe(0.3)
    expect(repaired.find((item) => item.id === 'text')?.text).toBe('你好 !!!')
    expect(repaired.find((item) => item.id === 'text')?.durationSeconds).toBe(1)
  })
})
