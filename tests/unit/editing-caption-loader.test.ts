import { describe, expect, it } from 'vitest'
import { areEditingCaptionWordsCompatible } from '../../src/renderer/src/app/editing-caption-loader'

describe('editing caption word sidecar compatibility', () => {
  it('keeps word timings when the sidecar text matches the formal caption', () => {
    expect(areEditingCaptionWordsCompatible('Hello world', [
      { startSeconds: 0, endSeconds: 0.5, text: 'Hello' },
      { startSeconds: 0.5, endSeconds: 1, text: ' world' }
    ])).toBe(true)
  })

  it('drops stale word timings when a formal caption was rewritten', () => {
    expect(areEditingCaptionWordsCompatible('外部更新字幕', [
      { startSeconds: 0, endSeconds: 0.5, text: '第一句脚本' }
    ])).toBe(false)
  })
})
