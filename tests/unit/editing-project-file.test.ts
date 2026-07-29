import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
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
    expect(parseEditingProjectFile(serialized)).toEqual(project)
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

  it('round-trips optional incoming transitions without changing the schema version', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, videoClips: [{ ...project.videoClips[0]!, transitionIn: { type: 'fade', durationSeconds: 0.5 } }] })
    expect(parsed.videoClips[0]).toMatchObject({ transitionIn: { type: 'fade', durationSeconds: 0.5 } })
    expect(parsed.schemaVersion).toBe(1)
  })

  it('round-trips optional graphic blocks without changing the schema version', () => {
    const project = createEditingProject(source)
    const parsed = parseEditingProject({ ...project, graphics: [{ id: 'graphic-1', startSeconds: 1, durationSeconds: 2, text: 'Title', position: 'top-right', style: 'title' }] })
    expect(parsed.graphics).toEqual([{ id: 'graphic-1', startSeconds: 1, durationSeconds: 2, text: 'Title', position: 'top-right', style: 'title' }])
    expect(parsed.schemaVersion).toBe(1)
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
