import { describe, expect, it } from 'vitest'
import { canKeepRawSummaryWhileTranslatedSourceLoads } from '../../src/renderer/src/app/summary-cache-context'

const summary = {
  title: '伦敦一日游',
  overview: '一位游客观察城市生活。',
  synopsis: '游客在城市中度过一天。',
  keyPoints: ['城市观察'],
  characters: [],
  themes: ['生活'],
  chapters: [],
  ending: ''
}

describe('summary cache source transition', () => {
  it('keeps a valid raw summary visible while translated cache lookup finishes', () => {
    expect(canKeepRawSummaryWhileTranslatedSourceLoads({
      success: true,
      message: 'generated',
      sourceSubtitlePath: '/cache/raw.vtt',
      sourceSubtitleRevision: 12,
      sourceType: 'raw',
      targetLanguage: 'zh',
      mode: 'quick',
      summaryModel: 'model',
      summary
    }, {
      preferredSourceType: 'translated',
      rawSourcePath: '/cache/raw.vtt',
      rawSourceRevision: 12,
      targetLanguage: 'zh',
      summaryModel: 'model',
      mode: 'quick'
    })).toBe(true)
  })

  it('does not retain a summary after the raw source revision changes', () => {
    expect(canKeepRawSummaryWhileTranslatedSourceLoads({
      success: true,
      message: 'generated',
      sourceSubtitlePath: '/cache/raw.vtt',
      sourceSubtitleRevision: 12,
      sourceType: 'raw',
      targetLanguage: 'zh',
      mode: 'quick',
      summaryModel: 'model',
      summary
    }, {
      preferredSourceType: 'translated',
      rawSourcePath: '/cache/raw.vtt',
      rawSourceRevision: 13,
      targetLanguage: 'zh',
      summaryModel: 'model',
      mode: 'quick'
    })).toBe(false)
  })
})
