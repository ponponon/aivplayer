import { describe, expect, it } from 'vitest'
import { attachSubtitleWords, getSubtitleWordSidecarPath, parseWhisperSubtitleWords } from '../../src/shared/subtitle-timing'

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
})
