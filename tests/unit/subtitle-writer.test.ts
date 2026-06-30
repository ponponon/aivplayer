import { describe, expect, it } from 'vitest'
import {
  convertVttToSrt,
  formatSrtTimestamp,
  formatVttTimestamp,
  parseVtt,
  writeSrt,
  writeVtt
} from '../../src/main/ai/subtitle-writer'

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

  it('escapes special characters when writing VTT segments', () => {
    expect(writeVtt([{ startSeconds: 0, endSeconds: 1, text: '5 < 7 & 8 > 6' }])).toBe(
      'WEBVTT\n\n00:00:00.000 --> 00:00:01.000\n5 &lt; 7 &amp; 8 &gt; 6\n'
    )
  })

  it('parses standard VTT cues with cue ids', () => {
    expect(
      parseVtt(`WEBVTT\n\nintro\n00:00:00.000 --> 00:00:01.250\nhello world\n\n00:00:02.000 --> 00:00:03.000\n第二句\n`)
    ).toEqual([
      { startSeconds: 0, endSeconds: 1.25, text: 'hello world' },
      { startSeconds: 2, endSeconds: 3, text: '第二句' }
    ])
  })

  it('converts VTT text to SRT text', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:01.250\nhello world\n\n00:00:02.000 --> 00:00:03.000\n第二句\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:01,250\nhello world\n\n2\n00:00:02,000 --> 00:00:03,000\n第二句\n')
  })

  it('preserves multiline cue breaks when converting VTT to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello\nworld\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello\nworld\n')
  })

  it('strips VTT voice tags when converting to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<v Alice>hello</v>\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello\n')
  })

  it('strips common VTT formatting tags when converting to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<i>hello</i> <b>world</b>\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello world\n')
  })

  it('strips VTT class tags when converting to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n<c.green>hello</c>\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello\n')
  })

  it('removes ruby annotations when converting VTT to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello <ruby>漢<rt>kan</rt></ruby>\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello 漢\n')
  })

  it('decodes common HTML entities when converting VTT to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello &amp; &lt;world&gt; &nbsp;&#39;\n`)
    ).toBe("1\n00:00:00,000 --> 00:00:02,000\nhello & <world> '\n")
  })

  it('decodes additional typographic HTML entities when converting VTT to SRT', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nwait &hellip; &mdash; &ndash; &lrm;done\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nwait … — – done\n')
  })

  it('keeps invalid numeric HTML entities unchanged instead of throwing', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello &#99999999; world\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello &#99999999; world\n')
  })

  it('turns VTT br tags into SRT line breaks', () => {
    expect(
      convertVttToSrt(`WEBVTT\n\n00:00:00.000 --> 00:00:02.000\nhello<br>world\n`)
    ).toBe('1\n00:00:00,000 --> 00:00:02,000\nhello\nworld\n')
  })

  it('skips NOTE, STYLE, and REGION blocks in VTT text', () => {
    expect(
      parseVtt(
        [
          'WEBVTT',
          '',
          'STYLE',
          '::cue { color: red; }',
          '',
          'NOTE translator note',
          'keep this out of the transcript',
          '',
          'REGION',
          'id:subtitle',
          '',
          '00:00:00.000 --> 00:00:01.000 align:start line:0%',
          'hello'
        ].join('\n')
      )
    ).toEqual([{ startSeconds: 0, endSeconds: 1, text: 'hello' }])
  })

  it('ignores a UTF-8 BOM at the beginning of VTT text', () => {
    expect(parseVtt('\ufeffWEBVTT\n\n00:00:00.000 --> 00:00:01.000\nhello\n')).toEqual([
      { startSeconds: 0, endSeconds: 1, text: 'hello' }
    ])
  })

  it('writes an empty SRT file for an empty subtitle list', () => {
    expect(writeSrt([])).toBe('')
  })
})
