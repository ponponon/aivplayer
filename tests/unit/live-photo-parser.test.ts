import { describe, expect, it } from 'vitest'
import { parseEmbeddedMotionPhoto, replaceGoogleMotionPhotoVideoLength, updateGoogleMotionPhotoPresentationTimestamp, updateXiaomiLivePhotoTimeline } from '../../src/core/live-photo/live-photo-parser'

function createSyntheticPhoto(metadata: string): Buffer {
  const metadataBytes = Buffer.from(metadata, 'latin1')
  const app1Length = Buffer.alloc(2)
  app1Length.writeUInt16BE(metadataBytes.length + 2)
  const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), app1Length, metadataBytes, Buffer.from([0xff, 0xda, 0x00, 0x02, 0x11, 0xff, 0xd9])])
  const ftyp = Buffer.alloc(24)
  ftyp.writeUInt32BE(24, 0)
  ftyp.write('ftyp', 4, 'latin1')
  ftyp.write('mp42', 8, 'latin1')
  ftyp.writeUInt32BE(0, 12)
  ftyp.write('isom', 16, 'latin1')
  ftyp.write('mp42', 20, 'latin1')
  return Buffer.concat([jpeg, Buffer.from([0]), ftyp, Buffer.from('moov', 'latin1')])
}

describe('live photo parser', () => {
  it('识别小米自定义 JPEG + MP4 容器并提取视频边界', () => {
    const buffer = createSyntheticPhoto('{"version":3,"livephotoInfo":"head:1 time:2 tail:3"}')
    const parsed = parseEmbeddedMotionPhoto(buffer, 'sample.jpg')
    expect(parsed?.format).toBe('xiaomi')
    expect(parsed?.metadataVersion).toBe(3)
    expect(parsed?.metadataSummary).toContain('head:1')
    expect(parsed?.motionBytes.subarray(4, 8).toString('latin1')).toBe('ftyp')
  })

  it('识别 Google Motion Photo XMP 并更新视频长度字段', () => {
    const buffer = createSyntheticPhoto('<rdf:Description GCamera:MotionPhoto="1" GContainer:Directory="Container:Item Length="123"" />')
    const parsed = parseEmbeddedMotionPhoto(buffer, 'sample.jpg')
    expect(parsed?.format).toBe('google-motion-photo')
    const updated = replaceGoogleMotionPhotoVideoLength(buffer.subarray(0, parsed?.motionOffset ?? 0), 456)
    expect(updated.toString('latin1')).toContain('Length="456"')
  })

  it('根据截取区间更新 Google Motion Photo 的封面时间戳', () => {
    const buffer = Buffer.from('GCamera:MotionPhotoPresentationTimestampUs="2800000"', 'latin1')
    const updated = updateGoogleMotionPhotoPresentationTimestamp(buffer, 0.5)
    expect(updated.toString('latin1')).toContain('TimestampUs="2300000"')
    const selected = updateGoogleMotionPhotoPresentationTimestamp(buffer, 0.5, 1.25)
    expect(selected.toString('latin1')).toContain('TimestampUs="1250000"')
  })

  it('根据截取区间更新小米动态照片的封面时间线', () => {
    const buffer = Buffer.from('{"livephotoInfo":"head:1000000 time:2800000 tail:4400000"}', 'latin1')
    const updated = updateXiaomiLivePhotoTimeline(buffer, 0.5, 2)
    expect(updated.toString('latin1')).toContain('head:0000000 time:1300000 tail:2000000')
  })
})
