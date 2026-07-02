import { describe, expect, it } from 'vitest'
import {
  buildClipExportDefaultVideoPath,
  buildClipExportSubtitlePath,
  trimSrtToClip
} from '../../src/main/media/clip-export'

describe('clip export helpers', () => {
  it('builds a stable default output path from the current position and preset length', () => {
    expect(buildClipExportDefaultVideoPath('/clips/demo.mp4', 65.4, 30, 'burn-subtitle')).toBe(
      '/clips/demo-1m05s-30s-burn.mp4'
    )
    expect(buildClipExportDefaultVideoPath('/clips/demo.mp4', 0, 15, 'video')).toBe('/clips/demo-0s-15s-video.mp4')
  })

  it('builds the matching subtitle path for the exported clip video', () => {
    expect(buildClipExportSubtitlePath('/clips/demo-1m05s-30s-burn.mp4')).toBe('/clips/demo-1m05s-30s-burn.srt')
  })

  it('trims SRT cues to the requested clip window and restarts them from zero', () => {
    expect(
      trimSrtToClip(
        [
          '1',
          '00:00:05,000 --> 00:00:07,000',
          'hello',
          '',
          '2',
          '00:00:08,000 --> 00:00:12,000',
          'world'
        ].join('\n'),
        6,
        4
      )
    ).toBe('1\n00:00:00,000 --> 00:00:01,000\nhello\n\n2\n00:00:02,000 --> 00:00:04,000\nworld\n')
  })
})
