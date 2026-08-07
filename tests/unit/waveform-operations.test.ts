import { describe, expect, it } from 'vitest'
import type { EditingVideoClip } from '../../src/shared/editing-types'
import { getVideoClipSpans } from '../../src/core/editing/timeline-math'
import { getEditingWaveformSegments } from '../../src/core/editing/waveform-operations'

function clip(id: string, sourceId: string, start: number, end: number): EditingVideoClip {
  return { id, sourceId, sourceStartSeconds: start, sourceEndSeconds: end }
}

describe('editing waveform operations', () => {
  it('maps each surviving source clip into edited time while retaining source crop coordinates', () => {
    const spans = getVideoClipSpans([
      clip('clip-a', 'source-a', 4, 8),
      clip('clip-b', 'source-a', 12, 15),
      clip('clip-c', 'source-b', 0, 2)
    ])
    const segments = getEditingWaveformSegments(spans, {
      'source-a': { url: 'data:image/png;base64,a', durationSeconds: 20 },
      'source-b': { url: 'data:image/png;base64,b', durationSeconds: 4 }
    })

    expect(segments).toEqual([
      expect.objectContaining({ sourceId: 'source-a', editedStartSeconds: 0, editedEndSeconds: 4, sourceStartSeconds: 4, sourceEndSeconds: 8, sourceDurationSeconds: 20 }),
      expect.objectContaining({ sourceId: 'source-a', editedStartSeconds: 4, editedEndSeconds: 7, sourceStartSeconds: 12, sourceEndSeconds: 15, sourceDurationSeconds: 20 }),
      expect.objectContaining({ sourceId: 'source-b', editedStartSeconds: 7, editedEndSeconds: 9, sourceStartSeconds: 0, sourceEndSeconds: 2, sourceDurationSeconds: 4 })
    ])
  })

  it('skips clips whose waveform is unavailable without changing timeline spans', () => {
    const spans = getVideoClipSpans([clip('clip-a', 'source-a', 0, 3)])
    expect(getEditingWaveformSegments(spans, {})).toEqual([])
    expect(spans[0]?.editedEndSeconds).toBe(3)
  })
})
