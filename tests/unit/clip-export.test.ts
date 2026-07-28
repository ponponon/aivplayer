import { describe, expect, it } from 'vitest'
import {
  buildClipExportDefaultVideoPath,
  buildClipExportSubtitlePath,
  remapSrtToTimeline,
  trimSrtToClip
} from '../../src/core/media/clip-export'
import { buildTimelineExportDefaultVideoPath, buildTimelineConcatArgs, buildTimelineSegmentArgs, buildTimelineSubtitleText } from '../../src/core/media/timeline-export'

describe('clip export helpers', () => {
  it('builds a stable default output path from the current position and preset length', () => {
    expect(buildClipExportDefaultVideoPath('/clips/demo.mp4', 65.4, 30, 'burn-subtitle')).toBe(
      '/clips/demo-1m05s-30s-burn.mp4'
    )
    expect(buildClipExportDefaultVideoPath('/clips/demo.mp4', 0, 15, 'video')).toBe('/clips/demo-0s-15s-video.mp4')
  })

  it('builds the matching subtitle path for the exported clip video', () => {
    expect(buildClipExportSubtitlePath('/clips/demo-1m05s-30s-burn.mp4')).toBe('/clips/demo-1m05s-30s-burn.srt')
  })

  it('trims SRT cues to the requested clip window and restarts them from zero', () => {
    expect(
      trimSrtToClip(
        [
          '1',
          '00:00:05,000 --> 00:00:07,000',
          'hello',
          '',
          '2',
          '00:00:08,000 --> 00:00:12,000',
          'world'
        ].join('\n'),
        6,
        4
      )
    ).toBe('1\n00:00:00,000 --> 00:00:01,000\nhello\n\n2\n00:00:02,000 --> 00:00:04,000\nworld\n')
  })

  it('remaps subtitle cues across removed source ranges', () => {
    expect(
      remapSrtToTimeline(
        [
          '1',
          '00:00:01,000 --> 00:00:03,000',
          'before',
          '',
          '2',
          '00:00:08,500 --> 00:00:10,000',
          'after'
        ].join('\n'),
        [{ startSeconds: 0, endSeconds: 4 }, { startSeconds: 8, endSeconds: 12 }]
      )
    ).toBe('1\n00:00:01,000 --> 00:00:03,000\nbefore\n\n2\n00:00:04,500 --> 00:00:06,000\nafter\n')
  })

  it('builds a timeline output name and concat command', () => {
    expect(buildTimelineExportDefaultVideoPath('/clips/demo.mp4', 2, 10.8, 'video')).toBe('/clips/demo-timeline-2clips-10s-video.mp4')
    expect(buildTimelineConcatArgs('/tmp/segments.txt', '/clips/demo.mp4')).toEqual(expect.arrayContaining(['-f', 'concat', '-safe', '0', '/tmp/segments.txt', '/clips/demo.mp4']))
  })

  it('normalizes mixed sources and adds silence for a source without audio', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/vertical.mp4', startSeconds: 1, endSeconds: 4, durationSeconds: 3, hasAudio: false }, '/tmp/segment.mp4', { width: 1281, height: 721, frameRate: 25 })
    expect(args).toEqual(expect.arrayContaining([
      '-f', 'lavfi', 'anullsrc=channel_layout=stereo:sample_rate=48000',
      '-map', '1:a:0',
      '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1',
      '-af', 'volume=1', '-r', '25', '-ar', '48000', '-ac', '2'
    ]))
    expect(buildTimelineSegmentArgs({ mediaPath: '/clips/demo.mp4', startSeconds: 0, endSeconds: 1, durationSeconds: 1, volume: 0.35 }, '/tmp/volume.mp4')).toEqual(expect.arrayContaining(['-af', 'volume=0.35']))
  })

  it('keeps already-remapped project subtitle text from being remapped again', () => {
    const projectSubtitleText = '1\n00:00:00,000 --> 00:00:01,000\nproject caption\n'
    expect(buildTimelineSubtitleText({ editedSubtitleText: projectSubtitleText, sourceSubtitleText: '1\n00:00:05,000 --> 00:00:06,000\nsource caption\n', clips: [{ mediaPath: '/clips/demo.mp4', startSeconds: 5, endSeconds: 6 }] })).toBe(projectSubtitleText)
  })
})
