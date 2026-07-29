import { describe, expect, it } from 'vitest'
import { mergeSilenceIntervals, parseSilenceIntervals } from '../../src/core/media/silence-detection'

describe('FFmpeg silence detection helpers', () => {
  it('parses completed and trailing silence intervals with speech padding', () => {
    const output = '[silencedetect] silence_start: 1.000\n[silencedetect] silence_end: 2.000 | silence_duration: 1.000\n[silencedetect] silence_start: 8.000'
    expect(parseSilenceIntervals(output, { durationSeconds: 10, minSilenceDurationSeconds: 0.45, paddingSeconds: 0.1 })).toEqual([
      { startSeconds: 1.1, endSeconds: 1.9 },
      { startSeconds: 8.1, endSeconds: 9.9 }
    ])
  })

  it('merges adjacent pauses after FFmpeg splits them around a tiny audio spike', () => {
    expect(mergeSilenceIntervals([{ startSeconds: 1.1, endSeconds: 2 }, { startSeconds: 2.15, endSeconds: 3.4 }, { startSeconds: 5, endSeconds: 5.5 }])).toEqual([
      { startSeconds: 1.1, endSeconds: 3.4 },
      { startSeconds: 5, endSeconds: 5.5 }
    ])
  })
})
