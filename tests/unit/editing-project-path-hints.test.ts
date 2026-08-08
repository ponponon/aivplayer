import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { addEditingProjectSourcePathHints, resolveEditingProjectPathCaseInsensitive, resolveEditingProjectSourcePathHints } from '../../src/desktop/editing-project-path-hints'

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

  it('writes and resolves selected sidecar hints relative to the project file', () => {
    const project = {
      ...createEditingProject(source),
      captionSourcePaths: { [source.id]: { source: '/workspace/media/demo.srt', translation: '/workspace/media/demo.zh-CN.srt' } }
    }
    const saved = addEditingProjectSourcePathHints(project, '/workspace/projects/demo.aivproj')

    expect(saved.captionSourcePathHints).toEqual({ [source.id]: { source: '../media/demo.srt', translation: '../media/demo.zh-CN.srt' } })
    const resolved = resolveEditingProjectSourcePathHints({ ...saved, captionSourcePaths: { [source.id]: { source: '/old/media/demo.srt', translation: '/old/media/demo.zh-CN.srt' } } }, '/workspace/projects/demo.aivproj', (path) => path === '/workspace/media/demo.mp4' || path === '/workspace/media/demo.srt' || path === '/workspace/media/demo.zh-CN.srt')
    expect(resolved.captionSourcePaths).toEqual({ [source.id]: { source: '/workspace/media/demo.srt', translation: '/workspace/media/demo.zh-CN.srt' } })
  })

  it('clears a stale absolute preference when its portable hint is unavailable', () => {
    const project = {
      ...createEditingProject(source),
      captionSourcePaths: { [source.id]: { source: '/old/media/demo.srt', translation: null } },
      captionSourcePathHints: { [source.id]: { source: '../missing/demo.srt', translation: null } }
    }
    const resolved = resolveEditingProjectSourcePathHints(project, '/workspace/projects/demo.aivproj', (path) => path === '/workspace/media/demo.mp4')

    expect(resolved.captionSourcePaths).toEqual({ [source.id]: { source: null, translation: null } })
    expect(resolved.captionSourcePathHints).toEqual(project.captionSourcePathHints)
  })

  it('normalizes Windows separators and accepts canonical casing from a case-insensitive resolver', () => {
    const project = {
      ...createEditingProject({ ...source, path: '/old/media/demo.mp4' }),
      sources: [{ ...source, path: '/old/media/demo.mp4', relativePath: '..\\Media\\Demo.MP4' }],
      captionSourcePaths: { [source.id]: { source: '/old/media/demo.SRT', translation: null } },
      captionSourcePathHints: { [source.id]: { source: '..\\Media\\Demo.SRT', translation: null } }
    }
    const resolved = resolveEditingProjectSourcePathHints(project, '/workspace/projects/demo.aivproj', () => false, (path) => {
      if (path === '/workspace/Media/Demo.MP4') return '/workspace/Media/Demo.MP4'
      if (path === '/workspace/Media/Demo.SRT') return '/workspace/Media/Demo.SRT'
      return null
    })

    expect(resolved.sources[0]?.path).toBe('/workspace/Media/Demo.MP4')
    expect(resolved.captionSourcePaths).toEqual({ [source.id]: { source: '/workspace/Media/Demo.SRT', translation: null } })
  })

  it('walks a real path when directory and file casing differ', () => {
    const root = mkdtempSync(join(tmpdir(), 'aivplayer-path-hints-'))
    const canonicalPath = join(root, 'Media', 'Demo.SRT')
    mkdirSync(join(root, 'Media'))
    writeFileSync(canonicalPath, 'demo')

    try {
      expect(resolveEditingProjectPathCaseInsensitive(join(root, 'media', 'demo.srt'))).toBe(canonicalPath)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
