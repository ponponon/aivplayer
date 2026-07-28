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

  it('rejects malformed JSON before it reaches the editor', () => {
    expect(() => parseEditingProjectFile('{"schemaVersion": 1}')).toThrow('Invalid AIVPlayer editing project')
  })
})
