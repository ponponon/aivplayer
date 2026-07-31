import { describe, expect, it } from 'vitest'
import { parseFfmpegSubtitleFilter } from '../../src/core/media/ffmpeg-capabilities'

describe('ffmpeg subtitle capabilities', () => {
  it('detects the subtitles filter used for ASS burn-in', () => {
    expect(parseFfmpegSubtitleFilter(' T.. subtitles        V->V       Render subtitles')).toBe('subtitles')
  })

  it('accepts the ass filter as an equivalent libass burn-in path', () => {
    expect(parseFfmpegSubtitleFilter(' T.. ass             V->V       Render ASS subtitles')).toBe('ass')
  })

  it('does not mistake unrelated video filters for subtitle support', () => {
    expect(parseFfmpegSubtitleFilter(' T.. drawtext        V->V       Draw text\n T.. overlay        VV->V      Overlay')).toBeNull()
  })
})
