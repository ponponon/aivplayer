import { describe, expect, it } from 'vitest'
import { mergeJpegCoverMetadata } from '../../src/core/live-photo/jpeg-cover'

function segment(marker: number, payload: string): Buffer {
  const bytes = Buffer.from(payload, 'latin1')
  const length = Buffer.alloc(2)
  length.writeUInt16BE(bytes.length + 2)
  return Buffer.concat([Buffer.from([0xff, marker]), length, bytes])
}

describe('jpeg cover metadata merge', () => {
  it('保留原封面 APP 元数据并使用新封面的图像数据', () => {
    const original = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xe1, 'XIAOMI_CUSTOMIZE'), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9])])
    const rendered = Buffer.concat([Buffer.from([0xff, 0xd8]), segment(0xe0, 'NEW_JFIF'), segment(0xdb, 'NEW_QUANT'), Buffer.from([0xff, 0xda, 0x00, 0x02, 0x22, 0xff, 0xd9])])
    const merged = mergeJpegCoverMetadata(original, rendered)
    expect(merged.includes(Buffer.from('XIAOMI_CUSTOMIZE', 'latin1'))).toBe(true)
    expect(merged.includes(Buffer.from('NEW_JFIF', 'latin1'))).toBe(false)
    expect(merged.includes(Buffer.from('NEW_QUANT', 'latin1'))).toBe(true)
    expect(merged.includes(Buffer.from([0x22]))).toBe(true)
  })
})

