import { describe, expect, it } from 'vitest'
import { buildSubtitleDisplayText } from '../../src/renderer/src/subtitle-overlay'

describe('subtitle overlay display text', () => {
  it('renders source, translation, and bilingual subtitle text from display mode', () => {
    expect(
      buildSubtitleDisplayText({
        sourceText: 'hello world',
        translationText: '你好，世界',
        displayMode: 'source'
      })
    ).toBe('hello world')

    expect(
      buildSubtitleDisplayText({
        sourceText: 'hello world',
        translationText: '你好，世界',
        displayMode: 'translation'
      })
    ).toBe('你好，世界')

    expect(
      buildSubtitleDisplayText({
        sourceText: 'hello world',
        translationText: '你好，世界',
        displayMode: 'bilingual'
      })
    ).toBe('hello world\n你好，世界')
  })

  it('falls back to source text when translation is unavailable', () => {
    expect(
      buildSubtitleDisplayText({
        sourceText: 'hello world',
        translationText: null,
        displayMode: 'translation'
      })
    ).toBe('hello world')
  })
})
