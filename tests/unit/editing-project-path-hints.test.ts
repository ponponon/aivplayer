import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { addEditingProjectSourcePathHints, resolveEditingProjectSourcePathHints } from '../../src/desktop/editing-project-path-hints'

const source = { id: 'source-1', path: '/workspace/media/demo.mp4', name: 'demo.mp4', fingerprint: '/workspace/media/demo.mp4:12', durationSeconds: 12 }

describe('editing project source path hints', () => {
  it('writes a relative hint from the project file directory', () => {
    const project = addEditingProjectSourcePathHints(createEditingProject(source), '/workspace/projects/demo.aivproj')

    expect(project.sources[0]?.relativePath).toBe('../media/demo.mp4')
    expect(project.sources[0]?.path).toBe(source.path)
  })

  it('resolves an available hint while preserving source identity', () => {
    const project = { ...createEditingProject({ ...source, path: '/old/media/demo.mp4' }), sources: [{ ...source, path: '/old/media/demo.mp4', relativePath: '../media/demo.mp4' }] }
    const resolved = resolveEditingProjectSourcePathHints(project, '/workspace/projects/demo.aivproj', (path) => path === '/workspace/media/demo.mp4')

    expect(resolved.sources[0]).toMatchObject({ id: source.id, path: '/workspace/media/demo.mp4', fingerprint: '/workspace/media/demo.mp4:12', relativePath: '../media/demo.mp4' })
  })

  it('leaves an unresolved hint for the explicit repair flow', () => {
    const project = addEditingProjectSourcePathHints(createEditingProject(source), '/workspace/projects/demo.aivproj')
    const unresolved = resolveEditingProjectSourcePathHints(project, '/workspace/projects/demo.aivproj', () => false)

    expect(unresolved.sources[0]).toEqual(project.sources[0])
  })
})
