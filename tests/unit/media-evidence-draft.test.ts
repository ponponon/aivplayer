import { describe, expect, it } from 'vitest'
import {
  createMediaEvidenceDraftId,
  normalizeMediaEvidenceDraftCues,
  summarizeMediaEvidenceDraftCues
} from '../../src/core/ai/media-evidence-draft'

describe('media evidence draft cues', () => {
  it('normalizes and sorts multiple cues into a stable summary', () => {
    const cues = normalizeMediaEvidenceDraftCues([
      { startSeconds: 2.0004, endSeconds: 3.001, text: ' second  ' },
      { startSeconds: 0, endSeconds: 1.5, text: 'first\r\nline' }
    ])

    expect(cues).toEqual([
      { startSeconds: 0, endSeconds: 1.5, text: 'first\nline' },
      { startSeconds: 2, endSeconds: 3.001, text: 'second' }
    ])
    expect(summarizeMediaEvidenceDraftCues(cues)).toEqual({ startSeconds: 0, endSeconds: 3.001, text: 'first\nline\nsecond' })
    expect(createMediaEvidenceDraftId('source-a', cues)).toMatch(/^tts-draft-[a-f0-9]{24}$/)
    expect(createMediaEvidenceDraftId('source-a', cues)).toBe(createMediaEvidenceDraftId('source-a', cues))
  })

  it('rejects overlapping, empty and excessive cue input', () => {
    expect(() => normalizeMediaEvidenceDraftCues([
      { startSeconds: 0, endSeconds: 2, text: 'one' },
      { startSeconds: 1.999, endSeconds: 3, text: 'two' }
    ])).toThrow('不能重叠')
    expect(() => normalizeMediaEvidenceDraftCues([{ startSeconds: 0, endSeconds: 1, text: ' ' }])).toThrow('文本无效')
    expect(() => normalizeMediaEvidenceDraftCues([])).toThrow('至少需要一条')
  })
})
