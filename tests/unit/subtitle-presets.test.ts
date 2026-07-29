import { describe, expect, it } from 'vitest'
import { buildAssSubtitle, buildAssSubtitleFromEditingCaptions } from '../../src/core/media/subtitle-ass'
import { createDefaultAppSettings } from '../../src/shared/app-settings'
import { getSubtitlePreset, splitSubtitleTextByKeywords } from '../../src/shared/subtitle-presets'

describe('subtitle visual presets', () => {
  it('splits repeated keywords without losing surrounding text', () => {
    expect(splitSubtitleTextByKeywords('这是 AI 的关键内容，AI 会保留。', 'AI,关键')).toEqual([
      { text: '这是 ', emphasized: false },
      { text: 'AI', emphasized: true },
      { text: ' 的', emphasized: false },
      { text: '关键', emphasized: true },
      { text: '内容，', emphasized: false },
      { text: 'AI', emphasized: true },
      { text: ' 会保留。', emphasized: false }
    ])
  })

  it('provides a safe fallback for an unknown preset', () => {
    expect(getSubtitlePreset('missing').id).toBe('clean')
    expect(createDefaultAppSettings().subtitles).toMatchObject({ presetId: 'clean', emphasisMode: 'words', keywords: '' })
  })

  it('serializes the same visual preset and keyword emphasis for FFmpeg burn-in', () => {
    const ass = buildAssSubtitle('1\n00:00:00,000 --> 00:00:01,500\nAI 关键内容', { presetId: 'yellow', emphasisMode: 'keywords', keywords: 'AI,关键', fontSizePx: 24 })
    expect(ass).toContain('Style: Default,Arial,24')
    expect(ass).toContain('Dialogue: 0,0:00:00.00,0:00:01.50')
    expect(ass).toContain('{\\c&H001F1A05\\b1}')
    expect(ass).toContain('AI')
    expect(ass).toContain('关键')
  })

  it('serializes relative caption word timing as ASS karaoke tags', () => {
    const ass = buildAssSubtitleFromEditingCaptions([{
      id: 'caption-1',
      startSeconds: 2,
      durationSeconds: 1.5,
      text: 'Hello world',
      kind: 'source',
      words: [
        { startSeconds: 0, endSeconds: 0.5, text: 'Hello' },
        { startSeconds: 0.5, endSeconds: 1.5, text: ' world' }
      ]
    }], { presetId: 'yellow', emphasisMode: 'words' })
    expect(ass).toContain('Style: Default,Arial,14,&H00F1FDFF,&H001F1A05')
    expect(ass).toContain('Dialogue: 0,0:00:02.00,0:00:03.50')
    expect(ass).toContain('{\\k50}Hello{\\k100} world')
  })
})
