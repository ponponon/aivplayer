import { describe, expect, it } from 'vitest'
import { buildMediaStructureSegments, DEFAULT_BLACK_PIXEL_THRESHOLD, mergeBlackIntervals, parseBlackIntervals } from '../../src/core/media/structure-analysis'

describe('media structure analysis', () => {
  it('uses FFmpeg pix_th as a per-pixel luma threshold', () => {
    expect(DEFAULT_BLACK_PIXEL_THRESHOLD).toBe(0.1)
  })

  it('parses blackdetect output and clamps it to the known duration', () => {
    const intervals = parseBlackIntervals('black_start:0 black_end:2.10 black_duration:2.10\nblack_start:20 black_end:22.5 black_duration:2.5', 21, 0.5)
    expect(intervals).toEqual([{ startSeconds: 0, endSeconds: 2.1 }, { startSeconds: 20, endSeconds: 21 }])
  })

  it('builds black, intro, and outro evidence with deterministic ids', () => {
    const segments = buildMediaStructureSegments([{ startSeconds: 0, endSeconds: 2 }, { startSeconds: 18, endSeconds: 20 }], 20)
    expect(segments.map((segment) => segment.kind)).toEqual(['black', 'intro', 'black', 'outro'])
    expect(segments[1]).toMatchObject({ id: 'structure-intro-0-2000', startSeconds: 0, endSeconds: 2, confidence: 0.9 })
    expect(segments[3]).toMatchObject({ id: 'structure-outro-18000-20000', startSeconds: 18, endSeconds: 20 })
  })

  it('merges adjacent black intervals before classification', () => {
    expect(mergeBlackIntervals([{ startSeconds: 0, endSeconds: 1 }, { startSeconds: 1.08, endSeconds: 2 }])).toEqual([{ startSeconds: 0, endSeconds: 2 }])
  })
})
