import { describe, expect, it } from 'vitest'
import type { EditingVideoClip } from '../../src/shared/editing-types'
import { isEditingPersonMatteNeutral, updateEditingClipPersonMatte } from '../../src/core/editing/person-matte-operations'

const clip: EditingVideoClip = { id: 'clip-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 4 }

describe('editing clip person matte operations', () => {
  it('treats absent settings as neutral', () => {
    expect(isEditingPersonMatteNeutral(clip)).toBe(true)
  })

  it('persists normalized settings and removes a neutral reset', () => {
    const enabled = updateEditingClipPersonMatte([clip], clip.id, { enabled: true, featherPercent: 20, outlineWidthPercent: 1.5, outlineColor: '#ABCDEF' })
    expect(enabled[0]).toMatchObject({ personMatte: { enabled: true, featherPercent: 12, outlineWidthPercent: 1.5, outlineColor: '#abcdef' } })
    const reset = updateEditingClipPersonMatte(enabled, clip.id, { enabled: false })
    expect(reset[0]).toEqual(clip)
  })

  it('does not modify other clips', () => {
    const other = { ...clip, id: 'clip-2' }
    const updated = updateEditingClipPersonMatte([clip, other], clip.id, { enabled: true })
    expect(updated[1]).toBe(other)
  })
})
