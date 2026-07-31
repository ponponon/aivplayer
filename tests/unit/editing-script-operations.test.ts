import { describe, expect, it } from 'vitest'
import { updateEditingScriptSegmentText, updateEditingSourceCaptionText } from '../../src/core/editing/script-operations'

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
})
