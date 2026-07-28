import { describe, expect, it } from 'vitest'
import { getEditingClipVolume, isEditingClipMuted, toggleEditingClipMuted, updateEditingClipVolume } from '../../src/core/editing/audio-operations'
import type { EditingVideoClip } from '../../src/shared/editing-types'

const clip: EditingVideoClip = { id: 'clip-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 3 }

describe('editing audio operations', () => {
  it('clamps clip volume and makes zero volume muted', () => {
    expect(updateEditingClipVolume([clip], 'clip-1', 1.5)[0]).toMatchObject({ volume: 1, muted: false })
    expect(updateEditingClipVolume([clip], 'clip-1', -1)[0]).toMatchObject({ volume: 0, muted: true })
  })

  it('restores audible volume when unmuting a zero-volume clip', () => {
    const muted = updateEditingClipVolume([clip], 'clip-1', 0)
    const audible = toggleEditingClipMuted(muted, 'clip-1')[0]!
    expect(getEditingClipVolume(audible)).toBe(1)
    expect(isEditingClipMuted(audible)).toBe(false)
  })
})
