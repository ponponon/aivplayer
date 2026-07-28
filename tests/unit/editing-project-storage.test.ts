import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { isEditingProjectCompatible } from '../../src/renderer/src/app/editing-project-storage'
import type { EditingSource } from '../../src/shared/editing-types'

const source: EditingSource = {
  id: 'source-demo',
  path: '/videos/demo.mp4',
  name: 'demo.mp4',
  fingerprint: '/videos/demo.mp4:12',
  durationSeconds: 12
}

describe('editing project storage compatibility', () => {
  it('accepts a project only when the source fingerprint still matches', () => {
    const project = createEditingProject(source, { now: 100 })
    expect(isEditingProjectCompatible(project, source)).toBe(true)
    expect(isEditingProjectCompatible(project, { ...source, fingerprint: '/videos/demo.mp4:13' })).toBe(false)
  })

  it('rejects a project whose clip leaves the source range invalid', () => {
    const project = createEditingProject(source, { now: 100 })
    const invalid = { ...project, videoClips: [{ ...project.videoClips[0]!, sourceEndSeconds: 0 }] }
    expect(isEditingProjectCompatible(invalid, source)).toBe(false)
  })

  it('accepts secondary sources while still matching the active primary source', () => {
    const project = createEditingProject(source, { now: 100 })
    const secondary = { ...source, id: 'source-secondary', path: '/videos/secondary.mp4', name: 'secondary.mp4', fingerprint: '/videos/secondary.mp4:3', durationSeconds: 3 }
    const multiSource = { ...project, sources: [source, secondary], videoClips: [...project.videoClips, { id: 'secondary-clip', sourceId: secondary.id, sourceStartSeconds: 0, sourceEndSeconds: 3 }] }
    expect(isEditingProjectCompatible(multiSource, source)).toBe(true)
    expect(isEditingProjectCompatible({ ...multiSource, videoClips: [{ ...multiSource.videoClips[1]!, sourceEndSeconds: 4 }] }, source)).toBe(false)
  })
})
