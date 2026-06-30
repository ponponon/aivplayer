import { describe, expect, it } from 'vitest'
import { getSiblingSrtPath } from '../../src/main/ai/whisper-cpp-runtime'

describe('whisper cpp runtime subtitle helpers', () => {
  it('derives a sibling SRT path from a subtitle file path', () => {
    expect(getSiblingSrtPath('/cache/subtitles/demo.vtt')).toBe('/cache/subtitles/demo.srt')
    expect(getSiblingSrtPath('/cache/subtitles/demo')).toBe('/cache/subtitles/demo.srt')
    expect(getSiblingSrtPath('/cache/subtitles/demo.sub.vtt')).toBe('/cache/subtitles/demo.sub.srt')
  })
})
