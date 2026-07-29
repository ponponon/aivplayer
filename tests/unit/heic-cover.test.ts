import { describe, expect, it } from 'vitest'
import { isHeicPath } from '../../src/core/live-photo/heic-cover'

describe('heic cover helpers', () => {
  it('识别大小写混合的 HEIC/HEIF 扩展名', () => {
    expect(isHeicPath('/tmp/photo.HEIC')).toBe(true)
    expect(isHeicPath('/tmp/photo.heif')).toBe(true)
    expect(isHeicPath('/tmp/photo.jpg')).toBe(false)
  })
})
