import { describe, expect, it } from 'vitest'
import { getAppCopy } from '../../src/shared/i18n'
import type { AppLocale } from '../../src/shared/localization'

const locales: AppLocale[] = ['zh-CN', 'en-US', 'ja-JP', 'ko-KR']

describe('editing project repair copy', () => {
  it('exposes the repair summary copy in every supported locale', () => {
    for (const locale of locales) {
      const copy = getAppCopy(locale).editing
      expect(copy.projectRepairSummary(1, 2, 3)).toContain('1')
      expect(copy.projectRepairMapped('source.mp4', '/new/source.mp4')).toContain('/new/source.mp4')
      expect(copy.projectRepairUnresolved('source.mp4')).toContain('source.mp4')
      expect(copy.projectRepairAmbiguous('source.mp4', ['/a/source.mp4'])).toContain('/a/source.mp4')
      expect(copy.projectRepairFailed.length).toBeGreaterThan(0)
    }
  })
})
