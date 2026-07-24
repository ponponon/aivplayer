import { describe, expect, it } from 'vitest'
import { getContentTypeForFile, parseRangeHeader } from '../../src/desktop/media/media-protocol'

describe('media protocol helpers', () => {
  it('parses bounded byte range requests', () => {
    expect(parseRangeHeader('bytes=100-199', 1000)).toEqual({
      start: 100,
      end: 199,
      contentLength: 100
    })
  })

  it('parses open-ended byte range requests', () => {
    expect(parseRangeHeader('bytes=950-', 1000)).toEqual({
      start: 950,
      end: 999,
      contentLength: 50
    })
  })

  it('parses suffix byte range requests', () => {
    expect(parseRangeHeader('bytes=-128', 1000)).toEqual({
      start: 872,
      end: 999,
      contentLength: 128
    })
  })

  it('rejects invalid byte range requests', () => {
    expect(parseRangeHeader('bytes=1000-1200', 1000)).toBeNull()
    expect(parseRangeHeader('items=0-10', 1000)).toBeNull()
    expect(parseRangeHeader('bytes=20-10', 1000)).toBeNull()
  })

  it('returns useful content types for video and subtitles', () => {
    expect(getContentTypeForFile('/tmp/movie.mp4')).toBe('video/mp4')
    expect(getContentTypeForFile('/tmp/subtitle.vtt')).toBe('text/vtt; charset=utf-8')
  })
})
