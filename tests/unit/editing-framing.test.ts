import { describe, expect, it } from 'vitest'
import type { EditingVideoClip } from '../../src/shared/editing-types'
import { getEditingFramingKeyframes, getEditingFramingState, getEditingFramingTransform, resolveEditingFramingAtTime } from '../../src/core/editing/framing-operations'

const clip = (id: string, start: number, end: number, treatment?: EditingVideoClip['treatment'], treatmentScale?: number, treatmentAnchor?: EditingVideoClip['treatmentAnchor'], treatmentSize?: number): EditingVideoClip => ({ id, sourceId: 'source-1', sourceStartSeconds: start, sourceEndSeconds: end, treatment, treatmentScale, treatmentAnchor, treatmentSize })

describe('editing framing operations', () => {
  it('keeps full treatment centered even if stale scale data is present', () => {
    expect(getEditingFramingTransform({ treatment: 'full', scale: 2, size: 0, anchor: 'center' })).toEqual({ scale: 1, translateXPercent: 0, translateYPercent: 0 })
  })

  it('keeps old clips centered and maps punch-in anchors to preview transforms', () => {
    expect(getEditingFramingState(clip('full', 0, 2))).toEqual({ treatment: 'full', scale: 1, size: 0, anchor: 'center' })
    expect(getEditingFramingTransform({ treatment: 'punch-in', scale: 1.6, size: 18, anchor: 'left' })).toEqual({ scale: 1.6, translateXPercent: 30, translateYPercent: 0 })
    expect(getEditingFramingTransform({ treatment: 'punch-in', scale: 1.6, size: 18, anchor: 'right' })).toEqual({ scale: 1.6, translateXPercent: -30, translateYPercent: 0 })
  })

  it('maps corner and split sizes to compact canvas transforms', () => {
    expect(getEditingFramingState(clip('corner', 0, 2, 'corner-br', undefined, undefined, 35))).toMatchObject({ treatment: 'corner-br', size: 35, scale: 0.34 })
    expect(getEditingFramingTransform({ treatment: 'corner-br', scale: 0.34, size: 35, anchor: 'center' })).toEqual({ scale: 0.34, translateXPercent: 33, translateYPercent: 33 })
    expect(getEditingFramingTransform({ treatment: 'split-left', scale: 0.5, size: 50, anchor: 'center' })).toEqual({ scale: 0.5, translateXPercent: -25, translateYPercent: 0 })
  })

  it('deduplicates adjacent equal framing states while extending their span', () => {
    const keyframes = getEditingFramingKeyframes([
      { editedStartSeconds: 0, editedEndSeconds: 2, clip: clip('one', 0, 2) },
      { editedStartSeconds: 2, editedEndSeconds: 4, clip: clip('two', 2, 4) },
      { editedStartSeconds: 4, editedEndSeconds: 5, clip: clip('three', 4, 5, 'punch-in', 1.5, 'right') }
    ])
    expect(keyframes).toHaveLength(2)
    expect(keyframes[0]).toEqual({ at: 0, endAt: 4, state: { treatment: 'full', scale: 1, size: 0, anchor: 'center' } })
    expect(keyframes[1]).toEqual({ at: 4, endAt: 5, state: { treatment: 'punch-in', scale: 1.5, size: 18, anchor: 'right' } })
  })

  it('interpolates at the incoming clip boundary and settles on the target framing', () => {
    const keyframes = getEditingFramingKeyframes([
      { editedStartSeconds: 0, editedEndSeconds: 4, clip: clip('one', 0, 4) },
      { editedStartSeconds: 4, editedEndSeconds: 6, clip: clip('two', 4, 6, 'punch-in', 1.6, 'left') }
    ])
    expect(resolveEditingFramingAtTime(keyframes, 4)).toMatchObject({ scale: 1, translateXPercent: 0, translateYPercent: 0, isTransitioning: true })
    expect(resolveEditingFramingAtTime(keyframes, 4.175)).toMatchObject({ scale: 1.3, translateXPercent: 15, translateYPercent: 0, isTransitioning: true })
    expect(resolveEditingFramingAtTime(keyframes, 4.36)).toMatchObject({ scale: 1.6, translateXPercent: 30, translateYPercent: 0, isTransitioning: false })
  })
})
