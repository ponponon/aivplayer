import { describe, expect, it } from 'vitest'
import { getEditingSubtitleCandidateCopy } from '../../src/shared/editing-subtitle-candidate-copy'
import type { AppLocale } from '../../src/shared/localization'

const locales: AppLocale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']

describe('editing subtitle candidate copy', () => {
  it('exposes equivalent and distinct candidate explanations in every locale', () => {
    for (const locale of locales) {
      const copy = getEditingSubtitleCandidateCopy(locale)
      expect(copy.equivalentCandidatePaths('/a.vtt · /a.VTT')).toContain('/a.vtt')
      expect(copy.distinctCandidatePaths('/a.vtt · /a.srt')).toContain('/a.srt')
      expect(copy.auditSummary('demo.mp4', '原文', 2, 1, '/a.vtt')).toContain('/a.vtt')
      expect(copy.auditEquivalent('demo.mp4', '原文', '/a.vtt · /a.VTT')).toContain('/a.VTT')
      expect(copy.auditDistinct('demo.mp4', '原文', '/a.vtt · /a.srt')).toContain('/a.srt')
    }
  })
})
