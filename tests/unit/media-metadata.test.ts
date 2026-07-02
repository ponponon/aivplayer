import { describe, expect, it } from 'vitest'
import { parseMediaProbeOutput } from '../../src/main/media/media-metadata'

describe('media metadata probe parser', () => {
  it('extracts useful video and audio metadata from ffmpeg probe output', () => {
    const output = `
Input #0, mov,mp4,m4a,3gp,3g2,mj2, from '/Users/ponponon/Music/aivplayer_test_video_1min.mp4':
  Metadata:
    major_brand     : isom
    minor_version   : 512
    compatible_brands: isomiso2avc1mp41
    encoder         : Lavf62.12.100
  Duration: 00:01:00.07, start: 0.000000, bitrate: 1507 kb/s
  Stream #0:0[0x1](und): Video: h264 (High) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 1452 kb/s, 30 fps, 30 tbr, 15360 tbn (default)
    Metadata:
      handler_name    : VideoHandler
  Stream #0:1[0x2](und): Audio: aac (HE-AACv2) (mp4a / 0x6134706D), 44100 Hz, stereo, fltp, 48 kb/s (default)
    Metadata:
      handler_name    : SoundHandler
`

    const metadata = parseMediaProbeOutput(output)

    expect(metadata.durationSeconds).toBeCloseTo(60.07, 2)
    expect(metadata.overallBitrateKbps).toBe(1507)
    expect(metadata.video).toEqual({
      codec: 'h264',
      profile: 'High',
      width: 1920,
      height: 1080,
      frameRate: 30,
      displayAspectRatio: '16:9',
      bitRateKbps: 1452
    })
    expect(metadata.audio).toEqual({
      codec: 'aac',
      profile: 'HE-AACv2',
      channelLayout: 'stereo',
      sampleRateHz: 44100,
      bitRateKbps: 48
    })
  })
})
