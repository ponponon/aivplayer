import { describe, expect, it } from 'vitest'
import { formatSrtTimestamp, formatVttTimestamp, writeSrt, writeVtt } from '../../src/main/ai/subtitle-writer'

describe('subtitle writer', () => {
  it('formats SRT timestamps', () => {
    expect(formatSrtTimestamp(0)).toBe('00:00:00,000')
    expect(formatSrtTimestamp(65.432)).toBe('00:01:05,432')
    expect(formatSrtTimestamp(3661.5)).toBe('01:01:01,500')
  })

  it('formats VTT timestamps', () => {
    expect(formatVttTimestamp(65.432)).toBe('00:01:05.432')
  })

  it('writes SRT segments', () => {
    expect(
      writeSrt([
        { startSeconds: 0, endSeconds: 1.25, text: '  hello   world ' },
        { startSeconds: 2, endSeconds: 3, text: '第二句' }
      ])
    ).toBe('1\n00:00:00,000 --> 00:00:01,250\nhello world\n\n2\n00:00:02,000 --> 00:00:03,000\n第二句\n')
  })

  it('writes VTT segments', () => {
    expect(writeVtt([{ startSeconds: 0, endSeconds: 1, text: 'hello' }])).toBe(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello\n'
    )
  })
})
