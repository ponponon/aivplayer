import { describe, expect, it } from 'vitest'
import { EDITING_PUNCH_IN_DEFAULT_SCALE, type EditingVideoClip } from '../../src/shared/editing-types'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale, updateEditingClipTreatment } from '../../src/core/editing/treatment-operations'

const clip: EditingVideoClip = { id: 'clip-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 4 }

describe('editing treatment operations', () => {
  it('defaults old clips to full framing and uses a bounded punch-in scale', () => {
    expect(getEditingClipTreatment(clip)).toBe('full')
    expect(getEditingClipTreatmentScale(clip)).toBe(EDITING_PUNCH_IN_DEFAULT_SCALE)
    expect(getEditingClipTreatmentAnchor(clip)).toBe('center')
    expect(getEditingClipTreatmentScale({ treatmentScale: 99 })).toBe(2.5)
  })

  it('updates only the selected clip and removes punch-in state when reset', () => {
    const punchIn = updateEditingClipTreatment([clip, { ...clip, id: 'clip-2' }], 'clip-1', 'punch-in', 1.8, 'left')
    expect(punchIn[0]).toMatchObject({ treatment: 'punch-in', treatmentScale: 1.8, treatmentAnchor: 'left' })
    expect(punchIn[1]).toEqual({ ...clip, id: 'clip-2' })
    expect(updateEditingClipTreatment(punchIn, 'clip-1', 'full')[0]).toEqual(clip)
  })
})
