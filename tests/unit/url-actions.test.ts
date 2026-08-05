import { describe, expect, it, vi } from 'vitest'
import { isSupportedExternalUrl, openUrlInDefaultBrowser } from '../../src/desktop/system/url-actions'

describe('external URL actions', () => {
  it('accepts HTTP and HTTPS URLs only', () => {
    expect(isSupportedExternalUrl('http://192.168.1.20:43821/?access=alpha')).toBe(true)
    expect(isSupportedExternalUrl('https://example.com/path')).toBe(true)
    expect(isSupportedExternalUrl('file:///Users/pon/video.mp4')).toBe(false)
    expect(isSupportedExternalUrl('javascript:alert(1)')).toBe(false)
  })

  it('opens a valid URL through the system default browser', async () => {
    const openExternal = vi.fn(async () => undefined)

    await expect(openUrlInDefaultBrowser('http://127.0.0.1:43821/?access=alpha', { openExternal })).resolves.toBe(true)
    expect(openExternal).toHaveBeenCalledWith('http://127.0.0.1:43821/?access=alpha')
  })

  it('returns false when the URL is invalid or the system opener fails', async () => {
    const openExternal = vi.fn(async () => { throw new Error('browser unavailable') })

    await expect(openUrlInDefaultBrowser('file:///tmp/video.mp4', { openExternal })).resolves.toBe(false)
    expect(openExternal).not.toHaveBeenCalled()
    await expect(openUrlInDefaultBrowser('http://127.0.0.1:43821', { openExternal })).resolves.toBe(false)
  })
})
