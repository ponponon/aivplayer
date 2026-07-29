import { describe, expect, it } from 'vitest'
import { mergeEditingScriptSegments, scriptSegmentCaption, setEditingScriptSegmentDeleted } from '../../src/core/editing/script-operations'
import type { EditingCaption } from '../../src/shared/editing-types'

const sourceCaption = (id: string, text: string, start: number, end: number): EditingCaption => ({
  id,
  kind: 'source',
  text,
  startSeconds: start,
  durationSeconds: end - start,
  sourceId: 'source-1',
  sourceStartSeconds: start,
  sourceEndSeconds: end
})

describe('editing script operations', () => {
  it('keeps deleted transcript rows and merges translation text from matching source ranges', () => {
    const existing = [{ id: 'source-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 2, text: 'old', deleted: true }]
    const captions = [
      sourceCaption('source-1', 'updated', 0, 2),
      { ...sourceCaption('translation-source-1', '译文', 0, 2), id: 'translation-source-1', kind: 'translation' as const }
    ]

    expect(mergeEditingScriptSegments(existing, captions)).toEqual([{
      id: 'source-1',
      sourceId: 'source-1',
      sourceStartSeconds: 0,
      sourceEndSeconds: 2,
      text: 'updated',
      translationText: '译文',
      deleted: true
    }])
  })

  it('marks one script row without mutating the input', () => {
    const segments = [{ id: 'one', sourceId: 'source-1', sourceStartSeconds: 1, sourceEndSeconds: 2, text: 'one' }]
    const next = setEditingScriptSegmentDeleted(segments, 'one', true)
    expect(next).toEqual([{ ...segments[0], deleted: true }])
    expect(segments[0]).not.toHaveProperty('deleted')
  })

  it('creates source and translation captions from one restored script row', () => {
    const segment = { id: 'one', sourceId: 'source-1', sourceStartSeconds: 1, sourceEndSeconds: 2, text: 'one', translationText: '一' }
    expect(scriptSegmentCaption(segment, 'source', segment.text, 3, 1)).toMatchObject({ id: 'one', startSeconds: 3, durationSeconds: 1, kind: 'source' })
    expect(scriptSegmentCaption(segment, 'translation', segment.translationText, 3, 1)).toMatchObject({ id: 'translation-one', kind: 'translation' })
  })
})
