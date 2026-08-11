import { describe, expect, it } from 'vitest'
import { areSubtitleWordsCompatible, attachSubtitleWords, chunkSubtitleWordsByWidth, createFallbackSubtitleWords, getSubtitleWordSidecarPath, joinSubtitleWords, parseWhisperSubtitleWords } from '../../src/shared/subtitle-timing'

describe('subtitle word timing', () => {
  it('reads whisper.cpp full JSON token timestamps and merges Latin tokens into words', () => {
    const words = parseWhisperSubtitleWords(JSON.stringify({
      transcription: [{
        timestamps: { from: '00:00:01.000', to: '00:00:02.000' },
        text: ' Hello world!',
        tokens: [
          { text: ' Hello', timestamps: { from: '00:00:01.000', to: '00:00:01.300' } },
          { text: ' world', timestamps: { from: '00:00:01.350', to: '00:00:01.800' } },
          { text: '!', timestamps: { from: '00:00:01.800', to: '00:00:01.850' } }
        ]
      }]
    }))

    expect(words).toEqual([
      { startSeconds: 1, endSeconds: 1.3, text: ' Hello' },
      { startSeconds: 1.35, endSeconds: 1.85, text: ' world!' }
    ])
  })

  it('uses proportional cue timing when an old SRT/VTT has no JSON word sidecar', () => {
    const segments = attachSubtitleWords([
      { startSeconds: 2, endSeconds: 4, text: 'Hello world' }
    ], [], true)

    expect(segments[0]?.words?.map((word) => word.text)).toEqual(['Hello', ' world'])
    expect(segments[0]?.words?.[0]?.startSeconds).toBe(2)
    expect(segments[0]?.words?.at(-1)?.endSeconds).toBe(4)
  })

  it('derives the JSON sidecar from generated VTT or SRT paths', () => {
    expect(getSubtitleWordSidecarPath('/cache/demo-raw.vtt')).toBe('/cache/demo-raw.json')
    expect(getSubtitleWordSidecarPath('/cache/demo-raw.srt')).toBe('/cache/demo-raw.json')
    expect(getSubtitleWordSidecarPath('/cache/demo.ass')).toBeNull()
  })

  it('uses word-like CJK fallback segments while preserving the full caption', () => {
    const words = createFallbackSubtitleWords('这是一个很长的字幕句子。', 0, 2)
    expect(words.map((word) => word.text).join('')).toBe('这是一个很长的字幕句子。')
    expect(words.map((word) => word.text)).toContain('字幕')
    expect(words.at(-1)?.text).toBe('。')
  })

  it('balances width chunks instead of producing an orphan tail', () => {
    const words = Array.from({ length: 16 }, (_, index) => ({ startSeconds: index, endSeconds: index + 1, text: '字' }))
    const chunks = chunkSubtitleWordsByWidth(words, 13)
    expect(chunks.map((chunk) => chunk.length)).toEqual([8, 8])
    expect(chunks.flat().map((word) => word.text).join('')).toBe('字'.repeat(16))
  })

  it('keeps Latin word boundaries and respects the width budget', () => {
    const words = [
      { startSeconds: 0, endSeconds: 0.3, text: 'Hello' },
      { startSeconds: 0.3, endSeconds: 0.6, text: ' world' },
      { startSeconds: 0.6, endSeconds: 0.9, text: ' again' }
    ]
    expect(joinSubtitleWords(words)).toBe('Hello world again')
    const chunks = chunkSubtitleWordsByWidth(words, 5)
    expect(chunks.flat().map((word) => word.text)).toEqual(words.map((word) => word.text))
    expect(chunks.every((chunk) => chunk.length >= 1)).toBe(true)
  })

  it('detects when edited word timings no longer cover the visible text', () => {
    const words = [{ startSeconds: 0, endSeconds: 0.5, text: '第一句' }]
    expect(areSubtitleWordsCompatible('第一句', words)).toBe(true)
    expect(areSubtitleWordsCompatible('第一句脚本', words)).toBe(false)
  })
})
