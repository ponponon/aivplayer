import { describe, expect, it } from 'vitest'
import { parseFfprobeOutput, parseMediaProbeOutput } from '../../src/core/media/media-metadata'

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

  it('extracts detailed ffprobe metadata into structured format and streams', () => {
    const output = `{
  "streams": [
    {
      "index": 0,
      "codec_name": "h264",
      "codec_long_name": "H.264 / AVC / MPEG-4 AVC / MPEG-4 part 10",
      "profile": "High",
      "codec_type": "video",
      "codec_tag_string": "avc1",
      "codec_tag": "0x31637661",
      "mime_codec_string": "avc1.640032",
      "width": 1920,
      "height": 1080,
      "coded_width": 1920,
      "coded_height": 1080,
      "has_b_frames": 2,
      "sample_aspect_ratio": "1:1",
      "display_aspect_ratio": "16:9",
      "pix_fmt": "yuv420p",
      "level": 50,
      "color_range": "tv",
      "color_space": "bt709",
      "color_transfer": "bt709",
      "color_primaries": "bt709",
      "chroma_location": "left",
      "field_order": "progressive",
      "is_avc": "true",
      "nal_length_size": "4",
      "id": "0x1",
      "r_frame_rate": "30/1",
      "avg_frame_rate": "30/1",
      "time_base": "1/15360",
      "start_time": "0.000000",
      "duration": "60.066667",
      "bit_rate": "1452654",
      "bits_per_raw_sample": "8",
      "nb_frames": "1802",
      "extradata_size": 51,
      "disposition": {
        "default": 1,
        "forced": 0
      },
      "tags": {
        "language": "und",
        "handler_name": "VideoHandler"
      }
    },
    {
      "index": 1,
      "codec_name": "aac",
      "codec_long_name": "AAC (Advanced Audio Coding)",
      "profile": "HE-AACv2",
      "codec_type": "audio",
      "codec_tag_string": "mp4a",
      "codec_tag": "0x6134706d",
      "mime_codec_string": "mp4a.40.29",
      "sample_fmt": "fltp",
      "sample_rate": "44100",
      "channels": 2,
      "channel_layout": "stereo",
      "bits_per_sample": 0,
      "initial_padding": 0,
      "id": "0x2",
      "r_frame_rate": "0/0",
      "avg_frame_rate": "0/0",
      "time_base": "1/44100",
      "start_time": "0.000000",
      "duration": "60.025011",
      "bit_rate": "48416",
      "nb_frames": "1296",
      "extradata_size": 4,
      "disposition": {
        "default": 1,
        "forced": 0
      },
      "tags": {
        "language": "und",
        "handler_name": "SoundHandler"
      }
    }
  ],
  "format": {
    "filename": "/Users/ponponon/Music/aivplayer_test_video_1min.mp4",
    "nb_streams": 2,
    "nb_programs": 0,
    "nb_stream_groups": 0,
    "format_name": "mov,mp4,m4a,3gp,3g2,mj2",
    "format_long_name": "QuickTime / MOV",
    "start_time": "0.000000",
    "duration": "60.066667",
    "size": "11322088",
    "bit_rate": "1507936",
    "probe_score": 100,
    "tags": {
      "major_brand": "isom",
      "minor_version": "512",
      "compatible_brands": "isomiso2avc1mp41",
      "encoder": "Lavf62.12.100"
    }
  }
}`

    const metadata = parseFfprobeOutput(output)

    expect(metadata).not.toBeNull()
    expect(metadata?.durationSeconds).toBeCloseTo(60.066667, 3)
    expect(metadata?.overallBitrateKbps).toBeCloseTo(1507.936, 3)
    expect(metadata?.video).toEqual({
      codec: 'h264',
      profile: 'High',
      width: 1920,
      height: 1080,
      frameRate: 30,
      displayAspectRatio: '16:9',
      bitRateKbps: 1452.654
    })
    expect(metadata?.audio).toEqual({
      codec: 'aac',
      profile: 'HE-AACv2',
      channelLayout: 'stereo',
      sampleRateHz: 44100,
      bitRateKbps: 48.416
    })
    expect(metadata?.details?.format).toMatchObject({
      format_long_name: 'QuickTime / MOV',
      format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
      probe_score: 100,
      tags: {
        encoder: 'Lavf62.12.100'
      }
    })
    expect(metadata?.details?.streams).toHaveLength(2)
    expect(metadata?.details?.streams[0]).toMatchObject({
      codec_name: 'h264',
      codec_type: 'video',
      display_aspect_ratio: '16:9',
      tags: {
        handler_name: 'VideoHandler'
      }
    })
    expect(metadata?.details?.streams[1]).toMatchObject({
      codec_name: 'aac',
      codec_type: 'audio',
      profile: 'HE-AACv2',
      tags: {
        handler_name: 'SoundHandler'
      }
    })
  })
})
