import { describe, expect, it } from 'vitest'
import { updateEditingTrackTrim } from '../../src/renderer/src/app/editing-track-trim'

describe('editing overlay trim helper', () => {
  it('snaps the start edge while keeping the end edge fixed', () => {
    const next = updateEditingTrackTrim({ id: 'graphic-1', edge: 'start', startSeconds: 2, endSeconds: 5, moved: false }, 0.96, 10, 0.2, [1])
    expect(next).toMatchObject({ startSeconds: 1, endSeconds: 5, moved: true })
  })

  it('snaps the end edge and enforces the minimum duration', () => {
    const next = updateEditingTrackTrim({ id: 'block-1', edge: 'end', startSeconds: 2, endSeconds: 5, moved: false }, 2.05, 10, 0.2, [2])
    expect(next).toMatchObject({ startSeconds: 2, endSeconds: 2.2, moved: true })
  })
})
