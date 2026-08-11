import { describe, expect, it } from 'vitest'
import { proposeEditingCaptionAlignment } from '../../src/core/editing/caption-alignment-preview'
import type { EditingCaption } from '../../src/shared/editing-types'

const caption = (id: string, startSeconds: number, durationSeconds: number): EditingCaption => ({
  id,
  kind: 'source',
  text: id,
  startSeconds,
  durationSeconds
})

describe('caption alignment preview', () => {
  it('proposes a same-duration shift from the current visual anchor', () => {
    const preview = proposeEditingCaptionAlignment([caption('later', 4, 1), caption('first', 1, 1), caption('last', 6, 2)], 2.5, 12)
    expect(preview).toMatchObject({
      captionIds: ['first', 'later', 'last'],
      sourceStartSeconds: 1,
      sourceEndSeconds: 8,
      targetStartSeconds: 2.5,
      targetEndSeconds: 9.5,
      offsetSeconds: 1.5,
      evidence: 'current-playhead',
      confidence: 'manual-visual-anchor',
      canApply: true
    })
  })

  it('keeps an out-of-bounds candidate visible but blocks applying it', () => {
    const preview = proposeEditingCaptionAlignment([caption('one', 1, 2)], -0.5, 10)
    expect(preview).toMatchObject({ targetStartSeconds: -0.5, targetEndSeconds: 1.5, canApply: false })
  })

  it('returns no candidate for an empty or invalid selection', () => {
    expect(proposeEditingCaptionAlignment([], 2, 10)).toBeNull()
    expect(proposeEditingCaptionAlignment([caption('bad', 1, 0)], 2, 10)).toBeNull()
    expect(proposeEditingCaptionAlignment([caption('one', 1, 1)], Number.NaN, 10)).toBeNull()
  })
})
