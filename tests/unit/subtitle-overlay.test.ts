import { describe, expect, it } from 'vitest'
import { buildSubtitleDisplayText, findActiveEditingCaption } from '../../src/renderer/src/subtitle-overlay'
import type { EditingCaption } from '../../src/shared/editing-types'

describe('subtitle overlay display text', () => {
  it('matches editing captions in edited timeline time', () => {
    const captions: EditingCaption[] = [
      { id: 'one', startSeconds: 0, durationSeconds: 2, kind: 'source', text: 'first' },
      { id: 'two', startSeconds: 4, durationSeconds: 2, kind: 'source', text: 'second' }
    ]
    expect(findActiveEditingCaption(captions, 4.5, 'source')?.text).toBe('second')
    expect(findActiveEditingCaption(captions, 2, 'source')).toBeNull()
  })

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
