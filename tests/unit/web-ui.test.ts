import { describe, expect, it } from 'vitest'
import { buildWebBatchDownloadUrl } from '../../src/web/web-ui'

describe('Web UI helpers', () => {
  it('encodes selected media IDs for a batch download', () => {
    expect(buildWebBatchDownloadUrl(['one', 'a media', ''])).toBe('/download/package?id=one&id=a+media')
  })
})
