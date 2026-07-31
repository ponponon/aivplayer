import { describe, expect, it } from 'vitest'
import { getEditingClipMotionPhase, getEditingClipMotionStyle, updateEditingClipMotion } from '../../src/core/editing/clip-motion'
import type { EditingVideoClip } from '../../src/shared/editing-types'

const clip: EditingVideoClip = {
  id: 'clip-motion',
  sourceId: 'source-1',
  sourceStartSeconds: 2,
  sourceEndSeconds: 6,
  enterMotion: 'slide-left',
  exitMotion: 'fade',
  motionDurationSeconds: 0.5
}

describe('editing main-track clip motion', () => {
  it('uses clip-local time and reserves both ends for motion', () => {
    expect(getEditingClipMotionPhase(clip, 0.25)).toEqual({ motion: 'slide-left', phase: 'enter', progress: 0.5 })
    expect(getEditingClipMotionPhase(clip, 3.75)).toEqual({ motion: 'fade', phase: 'exit', progress: 0.5 })
    expect(getEditingClipMotionPhase(clip, 2)).toBeNull()
  })

  it('maps enter and exit motion to preview styles', () => {
    expect(getEditingClipMotionStyle(clip, 0)).toMatchObject({ opacity: 1, translateXPercent: -100 })
    expect(getEditingClipMotionStyle(clip, 3.75)).toMatchObject({ opacity: 0.5, translateXPercent: 0 })
    expect(getEditingClipMotionStyle(clip, 2)).toEqual({ opacity: 1, translateXPercent: 0, translateYPercent: 0, scale: 1 })
  })

  it('updates only the selected clip and clamps the duration', () => {
    const other = { ...clip, id: 'clip-other' }
    const updated = updateEditingClipMotion([clip, other], clip.id, { enterMotion: 'scale', motionDurationSeconds: 4 })
    expect(updated[0]).toMatchObject({ enterMotion: 'scale', motionDurationSeconds: 1 })
    expect(updated[1]).toBe(other)
  })
})
