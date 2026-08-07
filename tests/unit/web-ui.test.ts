import { describe, expect, it } from 'vitest'
import { buildWebBatchDownloadUrl, getTranscodeStateLabel } from '../../src/web/web-ui'

describe('Web UI helpers', () => {
  it('encodes selected media IDs for a batch download', () => {
    expect(buildWebBatchDownloadUrl(['one', 'a media', ''])).toBe('/download/package?id=one&id=a+media')
  })

  it('labels transcode states for the task center', () => {
    expect(getTranscodeStateLabel('queued')).toBe('排队中')
    expect(getTranscodeStateLabel('running')).toBe('转码中')
    expect(getTranscodeStateLabel('ready')).toBe('已完成')
    expect(getTranscodeStateLabel('error')).toBe('失败')
  })
})
