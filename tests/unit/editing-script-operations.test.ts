import { describe, expect, it } from 'vitest'
import { getEditingScriptWordSourceRange, isEditingScriptFillerWord, mergeEditingScriptSegments, removeEditingScriptWord, removeEditingScriptWords, replaceEditingScriptWord, restoreEditingScriptSegmentCaptions, syncEditingSourceCaptionText, updateEditingScriptSegmentText, updateEditingSourceCaptionText } from '../../src/core/editing/script-operations'

const segment = { id: 'segment-1', sourceId: 'source-1', sourceStartSeconds: 1, sourceEndSeconds: 2, text: 'old text', translationText: '旧文本' }

describe('editing script text operations', () => {
  it('restores the source caption without replacing a kept translation caption', () => {
    const translation = {
      id: 'translation-source-1',
      kind: 'translation' as const,
      text: '手动调整后的译文',
      startSeconds: 1.25,
      durationSeconds: 0.5
    }
    const next = restoreEditingScriptSegmentCaptions([translation], { ...segment, id: 'source-source-1' }, [{ id: 'clip-1', sourceId: segment.sourceId, sourceStartSeconds: 0, sourceEndSeconds: 4 }])

    expect(next).toEqual([
      { id: 'source-source-1', sourceId: segment.sourceId, sourceStartSeconds: 1, sourceEndSeconds: 2, kind: 'source', text: segment.text, startSeconds: 1, durationSeconds: 1 },
      translation
    ])
  })

  it('creates a translation at the restored source range when no kept caption exists', () => {
    const next = restoreEditingScriptSegmentCaptions([], segment, [{ id: 'clip-1', sourceId: segment.sourceId, sourceStartSeconds: 0, sourceEndSeconds: 4 }])

    expect(next).toEqual([
      { id: segment.id, sourceId: segment.sourceId, sourceStartSeconds: 1, sourceEndSeconds: 2, kind: 'source', text: segment.text, startSeconds: 1, durationSeconds: 1 },
      { id: `translation-${segment.id}`, sourceId: segment.sourceId, sourceStartSeconds: 1, sourceEndSeconds: 2, kind: 'translation', text: segment.translationText, startSeconds: 1, durationSeconds: 1 }
    ])
  })

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

  it('removes a selected word batch and preserves the remaining timings', () => {
    const wordSegment = {
      ...segment,
      text: 'hello 嗯 world',
      words: [
        { startSeconds: 0, endSeconds: 0.3, text: 'hello' },
        { startSeconds: 0.3, endSeconds: 0.5, text: ' 嗯' },
        { startSeconds: 0.5, endSeconds: 1, text: ' world' }
      ]
    }
    expect(removeEditingScriptWords(wordSegment, [wordSegment.words[1]!, wordSegment.words[2]!])).toEqual({
      ...wordSegment,
      text: 'hello',
      words: [wordSegment.words[0]]
    })
  })

  it('replaces one word without changing its timing and keeps caption word data', () => {
    const wordSegment = {
      ...segment,
      text: 'hello world',
      words: [
        { startSeconds: 0, endSeconds: 0.4, text: 'hello' },
        { startSeconds: 0.4, endSeconds: 0.8, text: ' world' }
      ]
    }
    const next = replaceEditingScriptWord(wordSegment, wordSegment.words[1]!, ' planet ')
    expect(next).toEqual({
      ...wordSegment,
      text: 'hello planet',
      words: [wordSegment.words[0], { ...wordSegment.words[1], text: 'planet' }]
    })
    const sourceCaption = { id: segment.id, sourceId: segment.sourceId, sourceStartSeconds: 1, sourceEndSeconds: 2, startSeconds: 0, durationSeconds: 1, text: 'hello world', kind: 'source' as const, words: next.words }
    expect(syncEditingSourceCaptionText([sourceCaption], segment.id, next.text)).toEqual([{ ...sourceCaption, text: next.text }])
  })

  it('does not let a later sidecar refresh overwrite edited text or deleted words', () => {
    const existing = [{
      ...segment,
      text: '保留后的文本',
      words: [{ startSeconds: 0, endSeconds: 0.5, text: '保留后的文本' }]
    }]
    const captions = [{
      id: segment.id,
      sourceId: segment.sourceId,
      sourceStartSeconds: segment.sourceStartSeconds,
      sourceEndSeconds: segment.sourceEndSeconds,
      startSeconds: 0,
      durationSeconds: 1,
      kind: 'source' as const,
      text: 'sidecar 原文',
      words: [{ startSeconds: 0, endSeconds: 0.25, text: 'sidecar' }, { startSeconds: 0.25, endSeconds: 0.5, text: ' 原文' }]
    }]
    expect(mergeEditingScriptSegments(existing, captions)).toEqual(existing)
  })
})
