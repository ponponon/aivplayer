import { describe, expect, it } from 'vitest'
import { moveEditingCaption, removeEditingCaptionInterval, remapEditingCaptionsForReplacement, resizeEditingCaption } from '../../src/core/editing/caption-operations'
import { createEditingCaptionPathCandidates } from '../../src/renderer/src/app/editing-caption-loader'
import type { EditingCaption } from '../../src/shared/editing-types'

const caption: EditingCaption = {
  id: 'caption-1',
  startSeconds: 2,
  durationSeconds: 3,
  sourceId: 'source-1',
  sourceStartSeconds: 4,
  sourceEndSeconds: 7,
  kind: 'source',
  text: 'hello'
}

describe('editing caption operations', () => {
  it('builds source and translation sidecar candidates from a media path', () => {
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', null, 'source')).toEqual(['/videos/demo.srt', '/videos/demo.vtt', '/videos/demo.SRT', '/videos/demo.VTT'])
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', '/cache/demo.srt', 'translation')).toContain('/cache/demo.srt')
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', null, 'translation')).toContain('/videos/demo.zh-CN.vtt')
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', null, 'translation', 'en-US')).toContain('/videos/demo.en-US.srt')
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', null, 'translation', 'en-US')).not.toContain('/videos/demo.zh-CN.srt')
  })

  it('clamps a moved caption to the edited timeline and removes source anchoring', () => {
    expect(moveEditingCaption([caption], 'caption-1', 99, 10)).toEqual([{
      id: 'caption-1',
      startSeconds: 7,
      durationSeconds: 3,
      kind: 'source',
      text: 'hello'
    }])
  })

  it('keeps unknown captions and does not mutate the input', () => {
    const captions = [caption]
    const next = moveEditingCaption(captions, 'missing', 4, 10)
    expect(next).toEqual(captions)
    expect(next).not.toBe(captions)
  })

  it('trims a caption, clips word timings, and removes source anchoring', () => {
    const next = resizeEditingCaption([{ ...caption, words: [{ startSeconds: 0.5, endSeconds: 1.5, text: 'early' }, { startSeconds: 2, endSeconds: 3, text: 'late' }] }], 'caption-1', 3, 4.5, 10)
    expect(next).toEqual([{ id: 'caption-1', startSeconds: 3, durationSeconds: 1.5, kind: 'source', text: 'hello', words: [{ startSeconds: 0, endSeconds: 0.5, text: 'early' }, { startSeconds: 1, endSeconds: 1.5, text: 'late' }] }])
  })

  it('re-anchors the overlapping part of a caption to a replacement source', () => {
    const captions: EditingCaption[] = [
      { id: 'crossing', startSeconds: 4, durationSeconds: 4, sourceId: 'old-source', sourceStartSeconds: 4, sourceEndSeconds: 8, kind: 'source', text: 'crossing', words: [{ startSeconds: 0.5, endSeconds: 1.5, text: 'early' }, { startSeconds: 2, endSeconds: 4, text: 'late' }] },
      { id: 'other-source', startSeconds: 5, durationSeconds: 1, sourceId: 'other-source', sourceStartSeconds: 0, sourceEndSeconds: 1, kind: 'source', text: 'untouched' }
    ]
    expect(remapEditingCaptionsForReplacement(captions, { clip: { sourceId: 'old-source' }, editedStartSeconds: 5, editedEndSeconds: 8 }, 'new-source')).toEqual([
      { id: 'crossing', startSeconds: 5, durationSeconds: 3, sourceId: 'new-source', sourceStartSeconds: 0, sourceEndSeconds: 3, kind: 'source', text: 'crossing', words: [{ startSeconds: 0, endSeconds: 0.5, text: 'early' }, { startSeconds: 1, endSeconds: 3, text: 'late' }] },
      captions[1]
    ])
  })

  it('compresses word timings when an edited interval is removed', () => {
    expect(removeEditingCaptionInterval([{
      ...caption,
      durationSeconds: 4,
      text: 'one two three',
      words: [{ startSeconds: 0, endSeconds: 1, text: 'one' }, { startSeconds: 1, endSeconds: 2, text: ' two' }, { startSeconds: 2, endSeconds: 4, text: ' three' }]
    }], 3, 4)).toEqual([{
      ...caption,
      durationSeconds: 3,
      text: 'one two three',
      words: [{ startSeconds: 0, endSeconds: 1, text: 'one' }, { startSeconds: 1, endSeconds: 3, text: ' three' }]
    }])
  })
})
