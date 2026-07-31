import { describe, expect, it } from 'vitest'
import { createEditingVideoBlock, findActiveEditingVideoBlocks, findVisibleEditingVideoBlocks, getEditingVideoBlockMotionPhase, removeEditingVideoBlock, updateEditingVideoBlock } from '../../src/core/editing/video-block-operations'
import { buildTimelineGraphicOverlayFilter, buildTimelineOverlayFilter, buildTimelineVideoBlockOverlayFilter } from '../../src/core/media/timeline-export'

describe('editing video block operations', () => {
  it('creates a source-anchored PiP block with bounded timeline duration', () => {
    const block = createEditingVideoBlock('source-1', 4, 9, 10, { durationSeconds: 3, position: 'top-left', id: 'block-1' })
    expect(block).toEqual({ id: 'block-1', sourceId: 'source-1', sourceStartSeconds: 0, sourceEndSeconds: 1, startSeconds: 9, durationSeconds: 1, position: 'top-left', sizePercent: 32, borderRadius: 8, borderWidth: 2, enterMotion: 'none', exitMotion: 'none', motionDurationSeconds: 0.35 })
  })

  it('finds, moves and removes independent blocks', () => {
    const first = createEditingVideoBlock('source-1', 10, 0, 12, { durationSeconds: 3, id: 'block-1' })!
    const second = createEditingVideoBlock('source-2', 10, 4, 12, { durationSeconds: 2, id: 'block-2' })!
    expect(findActiveEditingVideoBlocks([first, second], 4.5).map((block) => block.id)).toEqual(['block-2'])
    const moved = updateEditingVideoBlock([first, second], 'block-2', { startSeconds: 7, position: 'top-right' }, 12)
    expect(moved[1]).toMatchObject({ startSeconds: 7, position: 'top-right' })
    expect(removeEditingVideoBlock(moved, 'block-1')).toEqual([moved[1]])
  })

  it('keeps the source end anchored when the left edge is trimmed', () => {
    const block = createEditingVideoBlock('source-1', 10, 2, 12, { durationSeconds: 3, id: 'block-1' })!
    const trimmed = updateEditingVideoBlock([block], 'block-1', { startSeconds: 3, durationSeconds: 2, sourceStartSeconds: 1 }, 12, new Map([['source-1', 10]]))
    expect(trimmed[0]).toMatchObject({ startSeconds: 3, durationSeconds: 2, sourceStartSeconds: 1, sourceEndSeconds: 3 })
  })

  it('keeps an animated block visible during its exit hold', () => {
    const block = createEditingVideoBlock('source-1', 10, 2, 12, { durationSeconds: 3, enterMotion: 'slide-left', exitMotion: 'fade', motionDurationSeconds: 0.5, id: 'block-motion' })!
    expect(getEditingVideoBlockMotionPhase(block, 2.25)).toEqual({ motion: 'slide-left', phase: 'enter', progress: 0.5 })
    expect(getEditingVideoBlockMotionPhase(block, 5.25)).toEqual({ motion: 'fade', phase: 'exit', progress: 0.5 })
    expect(findVisibleEditingVideoBlocks([block], 5.49).map((item) => item.id)).toEqual(['block-motion'])
    expect(findVisibleEditingVideoBlocks([block], 5.5)).toEqual([])
  })

  it('emits motion expressions and extends the overlay window for export', () => {
    const filter = buildTimelineVideoBlockOverlayFilter([{ mediaPath: '/videos/motion.mp4', sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 2, durationSeconds: 2, position: 'bottom-right', enterMotion: 'slide-left', exitMotion: 'fade', motionDurationSeconds: 0.5 }])
    expect(filter).toContain('tpad=stop_mode=clone:stop_duration=0.5')
    expect(filter).toContain('fade=t=out:st=2:d=0.5:alpha=1')
    expect(filter).toContain("enable='between(t,2,4.5)'")
    expect(filter).toContain('overlay=x=')
  })

  it('builds a composition filter for video blocks even without text cards', () => {
    const filter = buildTimelineVideoBlockOverlayFilter([{ mediaPath: '/videos/pip.mp4', sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 2, durationSeconds: 2, position: 'bottom-right' }])
    expect(filter).toContain('[1:v]setpts=PTS+2/TB')
    expect(filter).toContain('overlay=x=1230:y=694')
    expect(buildTimelineGraphicOverlayFilter([], [])).toBe('')
  })

  it('keeps custom block geometry in the export filter', () => {
    const filter = buildTimelineVideoBlockOverlayFilter([{ mediaPath: '/videos/pip.mp4', sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 2, durationSeconds: 2, position: 'bottom-right', sizePercent: 40, borderRadius: 18, borderWidth: 4 }])
    expect(filter).toContain('scale=768:432')
    expect(filter).toContain('drawbox=x=0:y=0:w=iw:h=ih:color=white@0.85:t=4')
    expect(filter).toContain("geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='")
  })

  it('shrinks the primary canvas during a split block and places the partner on the other side', () => {
    const filter = buildTimelineVideoBlockOverlayFilter([{ mediaPath: '/videos/split.mp4', sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 2, durationSeconds: 2, position: 'split-left' }])
    expect(filter).toContain('[0:v]split=2[split-base-full][split-source-0]')
    expect(filter).toContain('pad=1920:1080:0:0:color=black')
    expect(filter).toContain('overlay=x=960:y=0')
  })

  it('composes graphics and PiP according to the persisted overlay track order', () => {
    const graphics = [{ id: 'graphic-a', startSeconds: 0, durationSeconds: 4, text: 'Title', position: 'center' as const, style: 'title' as const }]
    const videoBlocks = [{ mediaPath: '/videos/pip.mp4', sourceStartSeconds: 0, sourceEndSeconds: 2, startSeconds: 0, durationSeconds: 2, position: 'bottom-right' as const }]
    const assets = [{ graphicId: 'graphic-a', imagePath: '/tmp/graphic-a.png' }]
    const videoBelowGraphics = buildTimelineOverlayFilter(graphics, assets, videoBlocks, 1920, 1080, ['videoBlocks', 'graphics', 'captions'], '/tmp/captions.ass')
    const graphicsBelowVideo = buildTimelineOverlayFilter(graphics, assets, videoBlocks, 1920, 1080, ['graphics', 'videoBlocks', 'captions'], '/tmp/captions.ass')
    const captionsBelowVideo = buildTimelineOverlayFilter(graphics, assets, videoBlocks, 1920, 1080, ['captions', 'videoBlocks', 'graphics'], '/tmp/captions.ass')
    expect(videoBelowGraphics.indexOf('[2:v]')).toBeLessThan(videoBelowGraphics.indexOf('[1:v]overlay='))
    expect(graphicsBelowVideo.indexOf('[1:v]overlay=')).toBeLessThan(graphicsBelowVideo.indexOf('[2:v]'))
    expect(videoBelowGraphics.indexOf('[1:v]overlay=')).toBeLessThan(videoBelowGraphics.indexOf('subtitles=filename='))
    expect(captionsBelowVideo.indexOf('subtitles=filename=')).toBeLessThan(captionsBelowVideo.indexOf('[2:v]'))
  })
})
