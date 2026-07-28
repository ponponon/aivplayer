import { describe, expect, it } from 'vitest'
import { moveEditingCaption } from '../../src/core/editing/caption-operations'
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
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', null, 'source')).toEqual(['/videos/demo.srt', '/videos/demo.vtt'])
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', '/cache/demo.srt', 'translation')).toContain('/cache/demo.srt')
    expect(createEditingCaptionPathCandidates('/videos/demo.mp4', null, 'translation')).toContain('/videos/demo.zh-CN.vtt')
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
})
