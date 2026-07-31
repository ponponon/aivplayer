import { describe, expect, it } from 'vitest'
import {
  buildClipExportDefaultVideoPath,
  buildClipExportSubtitlePath,
  remapSrtToTimeline,
  trimSrtToClip
} from '../../src/core/media/clip-export'
import { buildTimelineExportDefaultVideoPath, buildTimelineConcatArgs, buildTimelineGraphicOverlayFilter, buildTimelineSegmentArgs, buildTimelineSubtitleText, buildTimelineXfadeArgs, getTimelineXfadeTransitionName } from '../../src/core/media/timeline-export'
import { buildTimelineExportDefaultFileName, getTimelineExportPathBaseName, getTimelineExportPathDirectory, joinTimelineExportPath, normalizeTimelineExportFileName } from '../../src/shared/timeline-export-path'

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
    expect(buildTimelineExportDefaultFileName('/clips/demo.mp4', 2, 10.8, 'burn-subtitle')).toBe('demo-timeline-2clips-10s-burn.mp4')
    expect(getTimelineExportPathDirectory('/clips/demo.mp4')).toBe('/clips')
    expect(getTimelineExportPathBaseName('/clips/demo.mp4')).toBe('demo.mp4')
    expect(joinTimelineExportPath('/clips', 'edited.mp4')).toBe('/clips/edited.mp4')
    expect(normalizeTimelineExportFileName('用户剪辑/我的视频', 'fallback.mp4')).toBe('我的视频.mp4')
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

  it('uses a centered cover crop for a portrait canvas', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/demo.mp4', startSeconds: 0, endSeconds: 2, durationSeconds: 2 }, '/tmp/portrait.mp4', { width: 1080, height: 1920, fitMode: 'cover' })
    expect(args).toEqual(expect.arrayContaining(['-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920:(ow-iw)/2:(oh-ih)/2,setsar=1']))
  })

  it('adds a centered crop filter for punch-in clips', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/demo.mp4', startSeconds: 0, endSeconds: 2, durationSeconds: 2, treatment: 'punch-in', treatmentScale: 1.5 }, '/tmp/punch-in.mp4', { width: 1280, height: 720 })
    expect(args).toEqual(expect.arrayContaining(['-vf', 'crop=trunc(iw/1.5/2)*2:trunc(ih/1.5/2)*2:(iw-ow)/2:(ih-oh)/2,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1']))
  })

  it('moves the punch-in crop window to the chosen horizontal anchor', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/demo.mp4', startSeconds: 0, endSeconds: 2, durationSeconds: 2, treatment: 'punch-in', treatmentScale: 1.5, treatmentAnchor: 'right' }, '/tmp/punch-right.mp4', { width: 1280, height: 720 })
    expect(args).toEqual(expect.arrayContaining(['-vf', 'crop=trunc(iw/1.5/2)*2:trunc(ih/1.5/2)*2:iw-ow:(ih-oh)/2,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1']))
  })

  it('exports clip-level color grading through the FFmpeg eq filter', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/demo.mp4', startSeconds: 0, endSeconds: 2, durationSeconds: 2, filter: { brightness: 1.2, contrast: 0.9, saturate: 1.1 } }, '/tmp/color-grade.mp4', { width: 1280, height: 720 })
    expect(args).toEqual(expect.arrayContaining(['-vf', 'eq=brightness=0.2:contrast=0.9:saturation=1.1,scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1']))
  })

  it('applies a cached person matte track through an alpha merge', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/person.mp4', startSeconds: 2, endSeconds: 4, durationSeconds: 2, personMatte: { enabled: true, featherPercent: 4, outlineWidthPercent: 2, outlineColor: '#ffcc00' }, personMatteTrack: { sampleFps: 15, framePattern: '/cache/mask-%06d.png', frameCount: 30 } }, '/tmp/person-matte.mp4', { width: 1280, height: 720 })
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(args).toEqual(expect.arrayContaining(['-framerate', '15', '-start_number', '0', '/cache/mask-%06d.png', '-map', '[person-matte-v]']))
    expect(filterComplex).toContain('alphaextract')
    expect(filterComplex).toContain('boxblur=2:1')
    expect(filterComplex).toContain('alphamerge[person-matte-foreground]')
    expect(filterComplex).toContain('dilation=coordinates=255')
    expect(filterComplex).toContain('color=c=0xffcc00:s=1280x720')
    expect(filterComplex).toContain('overlay=format=auto[person-matte-v]')
  })

  it('exports a seam fade on the incoming and outgoing segments', () => {
    const previous = buildTimelineSegmentArgs({ mediaPath: '/clips/previous.mp4', startSeconds: 0, endSeconds: 4, durationSeconds: 4 }, '/tmp/previous.mp4', undefined, 0.4)
    const next = buildTimelineSegmentArgs({ mediaPath: '/clips/next.mp4', startSeconds: 0, endSeconds: 4, durationSeconds: 4, transitionIn: { type: 'fade', durationSeconds: 0.4 } }, '/tmp/next.mp4')
    expect(previous).toEqual(expect.arrayContaining(['-vf', 'fade=t=out:st=3.8:d=0.2:color=black,setsar=1', '-af', 'volume=1,afade=t=out:st=3.8:d=0.2']))
    expect(next).toEqual(expect.arrayContaining(['-vf', 'fade=t=in:st=0:d=0.2:color=black,setsar=1', '-af', 'volume=1,afade=t=in:st=0:d=0.2']))
  })

  it('exports main-track enter and exit motion through a canvas composition graph', () => {
    const args = buildTimelineSegmentArgs({ mediaPath: '/clips/motion.mp4', startSeconds: 0, endSeconds: 4, durationSeconds: 4, enterMotion: 'slide-left', exitMotion: 'fade', motionDurationSeconds: 0.5 }, '/tmp/motion.mp4', { width: 1280, height: 720, frameRate: 30 })
    const filterComplex = args[args.indexOf('-filter_complex') + 1]
    expect(args).toEqual(expect.arrayContaining(['-f', 'lavfi', 'color=c=black:s=1280x720:r=30:d=4', '-map', '[clip-motion-v]', '-map', '0:a?']))
    expect(filterComplex).toContain('[0:v]scale=1280:720:force_original_aspect_ratio=decrease')
    expect(filterComplex).toContain("overlay=x='(-1280)*(1-if(lt(t\\,0)\\,0\\,if(lt(t\\,0.5)\\,(t-0)/0.5\\,1)))'")
    expect(filterComplex).toContain('fade=t=out:st=3.5:d=0.5:color=black')
    expect(args).not.toContain('-vf')
  })

  it('builds a duration-preserving xfade chain for Pireel-style seam effects', () => {
    const args = buildTimelineXfadeArgs(
      ['/tmp/previous.mp4', '/tmp/next.mp4'],
      [
        { mediaPath: '/clips/previous.mp4', startSeconds: 0, endSeconds: 4, durationSeconds: 4 },
        { mediaPath: '/clips/next.mp4', startSeconds: 0, endSeconds: 4, durationSeconds: 4, transitionIn: { type: 'wipe-left', durationSeconds: 0.4 } }
      ],
      '/tmp/xfade.mp4',
      { frameRate: 30, audioSampleRate: 48000, audioChannels: 2 }
    )
    expect(getTimelineXfadeTransitionName('wipe-left')).toBe('wipeleft')
    expect(getTimelineXfadeTransitionName('circleopen')).toBe('circleopen')
    expect(getTimelineXfadeTransitionName('crosszoom')).toBe('zoomin')
    expect(args).toEqual(expect.arrayContaining(['-filter_complex']))
    expect(args.find((value) => value.includes('tpad=stop_mode=clone:stop_duration=0.4'))).toContain('xfade=transition=wipeleft:duration=0.4:offset=4')
    expect(args).toEqual(expect.arrayContaining(['-t', '8', '-map', '[vout]', '-map', '[aout]']))
  })

  it('keeps already-remapped project subtitle text from being remapped again', () => {
    const projectSubtitleText = '1\n00:00:00,000 --> 00:00:01,000\nproject caption\n'
    expect(buildTimelineSubtitleText({ editedSubtitleText: projectSubtitleText, sourceSubtitleText: '1\n00:00:05,000 --> 00:00:06,000\nsource caption\n', clips: [{ mediaPath: '/clips/demo.mp4', startSeconds: 5, endSeconds: 6 }] })).toBe(projectSubtitleText)
  })

  it('builds timed overlay stages for rasterized graphic cards', () => {
    expect(buildTimelineGraphicOverlayFilter(
      [{ id: 'graphic-a', startSeconds: 0.5, durationSeconds: 1.5, text: 'Title', position: 'center', style: 'title' }],
      [{ graphicId: 'graphic-a', imagePath: '/tmp/graphic-a.png' }]
    )).toBe("[0:v][1:v]overlay=x=0:y=0:enable='between(t,0.5,2)':eof_action=pass[vout]")
  })

  it('exports cropped graphic cards with the same enter and exit motion timing as preview', () => {
    const filter = buildTimelineGraphicOverlayFilter(
      [{ id: 'graphic-motion', startSeconds: 0.5, durationSeconds: 1.5, text: 'Title', position: 'center', style: 'title', enterMotion: 'slide-left', exitMotion: 'fade', motionDurationSeconds: 0.5 }],
      [{ graphicId: 'graphic-motion', imagePath: '/tmp/graphic-motion.png', x: 720, y: 200, width: 480, height: 120 }]
    )
    expect(filter).toContain('[1:v]setpts=PTS+0.5/TB')
    expect(filter).toContain('fade=t=out:st=1.5:d=0.5:alpha=1')
    expect(filter).toContain("overlay=x='720+(-480)*(1-if(lt(t\\,0.5)")
    expect(filter).toContain("enable='between(t,0.5,2.5)'")
  })
})
