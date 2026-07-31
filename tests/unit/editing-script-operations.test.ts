import { describe, expect, it } from 'vitest'
import { getEditingScriptWordSourceRange, isEditingScriptFillerWord, removeEditingScriptWord, updateEditingScriptSegmentText, updateEditingSourceCaptionText } from '../../src/core/editing/script-operations'

const segment = { id: 'segment-1', sourceId: 'source-1', sourceStartSeconds: 1, sourceEndSeconds: 2, text: 'old text', translationText: '旧文本' }

describe('editing script text operations', () => {
  it('normalizes one script row while preserving timing and translation', () => {
    const next = updateEditingScriptSegmentText([segment], segment.id, '  new   text  ')
    expect(next).toEqual([{ ...segment, text: 'new text' }])
    expect(next[0]).not.toBe(segment)
  })

  it('does not create an empty script row or touch other rows', () => {
    const other = { ...segment, id: 'segment-2' }
    const next = updateEditingScriptSegmentText([segment, other], segment.id, '   ')
    expect(next).toEqual([segment, other])
    expect(next[1]).toBe(other)
  })

  it('updates only the matching source caption, leaving translations untouched', () => {
    const sourceCaption = { id: segment.id, sourceId: segment.sourceId, sourceStartSeconds: 1, sourceEndSeconds: 2, startSeconds: 0, durationSeconds: 1, text: segment.text, kind: 'source' as const }
    const translationCaption = { ...sourceCaption, id: 'translation-segment-1', text: segment.translationText, kind: 'translation' as const }
    const next = updateEditingSourceCaptionText([sourceCaption, translationCaption], segment.id, 'updated')
    expect(next).toEqual([{ ...sourceCaption, text: 'updated' }, translationCaption])
  })

  it('maps and removes one timed word without changing the row source range', () => {
    const wordSegment = {
      ...segment,
      text: 'hello world again',
      words: [
        { startSeconds: 0, endSeconds: 0.4, text: 'hello' },
        { startSeconds: 0.4, endSeconds: 0.8, text: ' world' },
        { startSeconds: 0.8, endSeconds: 1, text: ' again' }
      ]
    }
    expect(getEditingScriptWordSourceRange(wordSegment, wordSegment.words[1]!)).toEqual({ startSeconds: 1.4, endSeconds: 1.8 })
    expect(removeEditingScriptWord(wordSegment, wordSegment.words[1]!)).toEqual({
      ...wordSegment,
      text: 'hello again',
      words: [wordSegment.words[0], wordSegment.words[2]]
    })
  })

  it('only marks conservative filler words for later batch deletion', () => {
    expect(isEditingScriptFillerWord({ text: '嗯' })).toBe(true)
    expect(isEditingScriptFillerWord({ text: 'um,' })).toBe(true)
    expect(isEditingScriptFillerWord({ text: '那个' })).toBe(false)
  })
})
