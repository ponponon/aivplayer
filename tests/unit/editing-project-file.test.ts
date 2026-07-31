import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { getEditingPersonMatteCacheKey, getEditingPersonMatteSettings } from '../../src/core/editing/person-matte'
import { parseEditingProject, parseEditingProjectFile, serializeEditingProject } from '../../src/core/editing/project-file'
import type { EditingSource } from '../../src/shared/editing-types'

const source: EditingSource = {
  id: 'source-file',
  path: '/videos/demo.mp4',
  name: 'demo.mp4',
  fingerprint: '/videos/demo.mp4:12',
  durationSeconds: 12
}

describe('editing project files', () => {
  it('round-trips a project as readable JSON', () => {
    const project = createEditingProject(source, { projectId: 'project-file', clipId: 'clip-file', now: 100 })
    const serialized = serializeEditingProject(project)

    expect(serialized).toContain('"schemaVersion": 1')
    expect(serialized).toContain('"canvasPreset": "source"')
    expect(parseEditingProjectFile(serialized)).toEqual(project)
  })

  it('round-trips caption canvas layout and rejects unsafe values', () => {
    const project = createEditingProject(source)
    const laidOut = { ...project, captionLayout: { xPercent: 42, yPercent: 76, widthPercent: 68, fontSizePx: 64 } }

    expect(parseEditingProjectFile(serializeEditingProject(laidOut)).captionLayout).toEqual(laidOut.captionLayout)
    expect(parseEditingProject({ ...project, captionLayout: undefined }).captionLayout).toBeUndefined()
    expect(() => parseEditingProject({ ...project, captionLayout: { xPercent: 2, yPercent: 76, widthPercent: 68, fontSizePx: 64 } })).toThrow('Invalid editing project caption layout')
  })

  it('round-trips an independent translation caption layout while accepting legacy layouts', () => {
    const project = createEditingProject(source)
    const captionLayout = { ...project.captionLayout!, translation: { xPercent: 54, yPercent: 89, widthPercent: 70, fontSizePx: 36 } }

    expect(parseEditingProjectFile(serializeEditingProject({ ...project, captionLayout })).captionLayout).toEqual(captionLayout)
    expect(() => parseEditingProject({ ...project, captionLayout: { ...captionLayout, translation: { ...captionLayout.translation, fontSizePx: 12 } } })).toThrow('Invalid editing project caption layout')
  })

  it('round-trips canvas presets and keeps legacy projects without the field valid', () => {
    const project = createEditingProject(source)
    const portrait = { ...project, canvasPreset: 'portrait' as const }

    expect(parseEditingProjectFile(serializeEditingProject(portrait)).canvasPreset).toBe('portrait')
    expect(parseEditingProject({ ...project, canvasPreset: undefined }).canvasPreset).toBeUndefined()
    expect(() => parseEditingProject({ ...project, canvasPreset: 'panorama' })).toThrow('Invalid editing project canvas preset')
  })

  it('rejects projects whose clips reference an unknown source', () => {
    const project = createEditingProject(source)
    expect(() => parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, sourceId: 'missing' }] })).toThrow('Invalid editing project clip')
  })

  it('round-trips optional clip audio settings', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, volume: 0.35, muted: true }] })
    expect(parsed.videoClips[0]).toMatchObject({ volume: 0.35, muted: true })
  })

  it('round-trips optional clip framing settings without changing the schema version', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, treatment: 'punch-in', treatmentScale: 1.6, treatmentAnchor: 'right' }] })
    expect(parsed.videoClips[0]).toMatchObject({ treatment: 'punch-in', treatmentScale: 1.6, treatmentAnchor: 'right' })
    expect(parsed.schemaVersion).toBe(1)
  })

  it('rejects an unsafe punch-in scale', () => {
    const project = createEditingProject(source)
    expect(() => parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, treatment: 'punch-in', treatmentScale: 3 }] })).toThrow('Invalid editing project clip')
  })

  it('round-trips optional shot color filters', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, filter: { brightness: 1.2, contrast: 0.9, saturate: 1.1 } }] })
    expect(parsed.videoClips[0]).toMatchObject({ filter: { brightness: 1.2, contrast: 0.9, saturate: 1.1 } })
  })

  it('round-trips optional person matte settings without changing the schema version', () => {
    const project = createEditingProject(source)
    const personMatte = { enabled: true, featherPercent: 4, outlineWidthPercent: 1.5, outlineColor: '#AABBCC' }
    const parsed = parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, personMatte }] })

    expect(parsed.videoClips[0]?.personMatte).toEqual(personMatte)
    expect(parsed.schemaVersion).toBe(1)
    expect(() => parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, personMatte: { ...personMatte, featherPercent: 13 } }] })).toThrow('Invalid editing project clip')
    expect(() => parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, personMatte: { ...personMatte, outlineColor: 'red' } }] })).toThrow('Invalid editing project clip')
  })

  it('normalizes person matte preview settings and keys caches by source range', () => {
    expect(getEditingPersonMatteSettings({ enabled: true, featherPercent: 99, outlineColor: '#AABBCC' })).toEqual({ enabled: true, featherPercent: 12, outlineWidthPercent: 0, outlineColor: '#aabbcc' })
    expect(getEditingPersonMatteCacheKey({ sourceFingerprint: 'demo:12', sourceStartSeconds: 1, sourceEndSeconds: 3 })).toBe('person-matte|modnet-webgpu-v1|demo:12|1|3|15')
    expect(getEditingPersonMatteCacheKey({ sourceFingerprint: 'demo:12', sourceStartSeconds: 1, sourceEndSeconds: 3.0004 })).toBe('person-matte|modnet-webgpu-v1|demo:12|1|3|15')
  })

  it('round-trips optional incoming transitions without changing the schema version', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, transitionIn: { type: 'fade', durationSeconds: 0.5 } }] })
    expect(parsed.videoClips[0]).toMatchObject({ transitionIn: { type: 'fade', durationSeconds: 0.5 } })
    expect(parsed.schemaVersion).toBe(1)
  })

  it('round-trips optional main-track motions while keeping legacy clips valid', () => {
    const project = createEditingProject(source)
    const animated = { ...project, videoClips: [{ ...project.videoClips[0]!, enterMotion: 'slide-left' as const, exitMotion: 'fade' as const, motionDurationSeconds: 0.5 }] }
    expect(parseEditingProjectFile(serializeEditingProject(animated)).videoClips).toEqual(animated.videoClips)
    expect(() => parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, enterMotion: 'bounce' }] })).toThrow('Invalid editing project clip')
    expect(() => parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, motionDurationSeconds: 1.1 }] })).toThrow('Invalid editing project clip')
    expect(parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, enterMotion: undefined, exitMotion: undefined, motionDurationSeconds: undefined }] }).videoClips[0]).not.toHaveProperty('enterMotion')
  })

  it('round-trips optional graphic blocks without changing the schema version', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, graphics: [{ id: 'graphic-1', startSeconds: 1, durationSeconds: 2, text: 'Title', position: 'top', style: 'title' }] })
    expect(parsed.graphics).toEqual([{ id: 'graphic-1', startSeconds: 1, durationSeconds: 2, text: 'Title', position: 'top', style: 'title' }])
    expect(parsed.schemaVersion).toBe(1)
  })

  it('round-trips optional graphic free transforms and rejects unsafe values', () => {
    const project = createEditingProject(source)
    const transformed = { ...project, graphics: [{ id: 'graphic-1', startSeconds: 1, durationSeconds: 2, text: 'Title', position: 'center' as const, style: 'title' as const, xPercent: 62, yPercent: 42, widthPercent: 48, rotationDegrees: -12 }] }
    expect(parseEditingProjectFile(serializeEditingProject(transformed)).graphics).toEqual(transformed.graphics)
    expect(() => parseEditingProject({ ...project, graphics: [{ ...transformed.graphics[0]!, xPercent: 101 }] })).toThrow('Invalid editing project graphic')
    expect(() => parseEditingProject({ ...project, graphics: [{ ...transformed.graphics[0]!, rotationDegrees: 181 }] })).toThrow('Invalid editing project graphic')
  })

  it('round-trips optional graphic motions and rejects unsafe values', () => {
    const project = createEditingProject(source)
    const animated = { ...project, graphics: [{ id: 'graphic-motion', startSeconds: 1, durationSeconds: 2, text: 'Title', position: 'center' as const, style: 'title' as const, enterMotion: 'slide-left' as const, exitMotion: 'fade' as const, motionDurationSeconds: 0.5 }] }
    expect(parseEditingProjectFile(serializeEditingProject(animated)).graphics).toEqual(animated.graphics)
    expect(() => parseEditingProject({ ...project, graphics: [{ ...animated.graphics[0]!, enterMotion: 'bounce' }] })).toThrow('Invalid editing project graphic')
    expect(() => parseEditingProject({ ...project, graphics: [{ ...animated.graphics[0]!, motionDurationSeconds: 1.1 }] })).toThrow('Invalid editing project graphic')
  })

  it('round-trips the optional overlay track order and normalizes omitted tracks', () => {
    const project = createEditingProject(source)
    const reordered = { ...project, overlayTrackOrder: ['captions', 'videoBlocks', 'graphics'] as Array<'captions' | 'videoBlocks' | 'graphics'> }
    expect(parseEditingProjectFile(serializeEditingProject(reordered)).overlayTrackOrder).toEqual(['captions', 'videoBlocks', 'graphics'])
    expect(parseEditingProject({ ...project, overlayTrackOrder: ['graphics'] }).overlayTrackOrder).toEqual(['graphics', 'videoBlocks', 'captions'])
    expect(() => parseEditingProject({ ...project, overlayTrackOrder: ['unknown'] })).toThrow('Invalid editing project overlay track order')
  })

  it('round-trips an optional visual frame and keeps legacy projects compatible', () => {
    const project = createEditingProject(source)
    const framed = { ...project, frameId: 'cinema' as const }

    expect(parseEditingProjectFile(serializeEditingProject(framed)).frameId).toBe('cinema')
    expect(parseEditingProject({ ...project, frameId: undefined }).frameId).toBeUndefined()
    expect(() => parseEditingProject({ ...project, frameId: 'unknown' })).toThrow('Invalid editing project frame')
  })

  it('round-trips a caption effect and rejects unknown effects', () => {
    const project = createEditingProject(source)
    expect(parseEditingProjectFile(serializeEditingProject({ ...project, captionEffect: 'kinetic-slam' })).captionEffect).toBe('kinetic-slam')
    expect(() => parseEditingProject({ ...project, captionEffect: 'unknown' })).toThrow('Invalid editing project caption effect')
    expect(parseEditingProject({ ...project, captionEffect: undefined }).captionEffect).toBeUndefined()
  })

  it('round-trips optional video blocks without changing the schema version', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, videoBlocks: [{ id: 'block-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 2, durationSeconds: 2, position: 'split-left', enterMotion: 'scale', exitMotion: 'fade', motionDurationSeconds: 0.5 }] })
    expect(parsed.videoBlocks).toEqual([{ id: 'block-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 2, durationSeconds: 2, position: 'split-left', enterMotion: 'scale', exitMotion: 'fade', motionDurationSeconds: 0.5 }])
    expect(parsed.schemaVersion).toBe(1)
  })

  it('round-trips optional transcript script state without changing the schema version', () => {
    const project = createEditingProject(source)
    const withScript = {
      ...project,
      scriptSegments: [{ id: 'source-segment', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 2, text: 'hello', deleted: true }]
    }
    expect(parseEditingProjectFile(serializeEditingProject(withScript))).toEqual(withScript)
  })

  it('round-trips relative caption word timing for karaoke preview and burn-in', () => {
    const project = createEditingProject(source)
    const withWords = {
      ...project,
      captions: [{
        id: 'caption-1',
        startSeconds: 0,
        durationSeconds: 2,
        sourceId: source.id,
        sourceStartSeconds: 0,
        sourceEndSeconds: 2,
        text: 'Hello world',
        kind: 'source' as const,
        words: [
          { startSeconds: 0, endSeconds: 0.6, text: 'Hello' },
          { startSeconds: 0.6, endSeconds: 2, text: ' world' }
        ]
      }]
    }
    expect(parseEditingProjectFile(serializeEditingProject(withWords))).toEqual(withWords)
  })

  it('rejects malformed JSON before it reaches the editor', () => {
    expect(() => parseEditingProjectFile('{"schemaVersion": 1}')).toThrow('Invalid AIVPlayer editing project')
  })
})
