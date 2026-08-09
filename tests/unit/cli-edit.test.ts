import { describe, expect, it } from 'vitest'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createEditingProject } from '../../src/core/editing/project'
import { inspectEditingProject, loadEditingProjectFile, searchEditingProjectCaptions } from '../../src/cli/cli-edit'
import { serializeEditingProject } from '../../src/core/editing/project-file'
import type { EditingSource } from '../../src/shared/editing-types'

const source: EditingSource = {
  id: 'source-main',
  path: '/videos/interview.mp4',
  name: 'interview.mp4',
  fingerprint: '/videos/interview.mp4:120',
  durationSeconds: 120,
  width: 1920,
  height: 1080
}

describe('aivcli edit read-only queries', () => {
  it('builds a stable project inspection without volatile timestamps', () => {
    const project = createEditingProject(source, { projectId: 'project-edit', clipId: 'clip-main', now: 123 })
    const inspected = inspectEditingProject({
      ...project,
      videoClips: [
        { ...project.videoClips[0]!, sourceStartSeconds: 0, sourceEndSeconds: 12 },
        { ...project.videoClips[0]!, id: 'clip-second', sourceStartSeconds: 30, sourceEndSeconds: 35 }
      ],
      captions: [
        { id: 'caption-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 1, durationSeconds: 2, text: '保留这一段', kind: 'source', words: [{ startSeconds: 0, endSeconds: 1, text: '保留' }] },
        { id: 'caption-1-translation', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 1, durationSeconds: 2, text: 'Keep this part', kind: 'translation' }
      ],
      scriptSegments: [
        { id: 'script-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, text: '保留这一段', translationText: 'Keep this part' },
        { id: 'script-2', sourceId: source.id, sourceStartSeconds: 3, sourceEndSeconds: 5, text: '删除这一段', deleted: true }
      ]
    })

    expect(inspected.timeline).toMatchObject({ durationSeconds: 17, clipCount: 2 })
    expect(inspected.timeline.clips[1]).toMatchObject({ editedStartSeconds: 12, editedEndSeconds: 17, sourceStartSeconds: 30 })
    expect(inspected.captions).toEqual({ total: 2, sourceCount: 1, translationCount: 1, wordTimedCount: 1 })
    expect(inspected.script).toEqual({ total: 2, activeCount: 1, deletedCount: 1, wordTimedCount: 0 })
    expect(inspected).not.toHaveProperty('createdAt')
    expect(inspected).not.toHaveProperty('updatedAt')
  })

  it('searches persisted script rows, including deleted rows and translations', () => {
    const project = createEditingProject(source, { projectId: 'project-search', now: 123 })
    const result = searchEditingProjectCaptions({
      ...project,
      scriptSegments: [
        { id: 'script-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, text: '保留这一段', translationText: 'Keep this part' },
        { id: 'script-2', sourceId: source.id, sourceStartSeconds: 4, sourceEndSeconds: 6, text: '删除这一段', deleted: true }
      ]
    }, 'keep', 10)

    expect(result).toMatchObject({ query: 'keep', totalMatches: 1 })
    expect(result.matches[0]).toMatchObject({ id: 'script-1', matchFields: ['translation'], deleted: false })
  })

  it('falls back to source captions for legacy projects without script rows', () => {
    const project = createEditingProject(source, { projectId: 'project-legacy', now: 123 })
    const result = searchEditingProjectCaptions({
      ...project,
      captions: [{ id: 'caption-1', sourceId: source.id, sourceStartSeconds: 2, sourceEndSeconds: 4, startSeconds: 2, durationSeconds: 2, text: 'Legacy caption', kind: 'source' }]
    }, undefined, 10)

    expect(result.matches).toHaveLength(1)
    expect(result.matches[0]).toMatchObject({ id: 'caption-1', sourceStartSeconds: 2, sourceEndSeconds: 4, text: 'Legacy caption' })
  })

  it('reads valid project files and classifies missing or malformed input', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-cli-edit-'))
    const projectPath = join(directory, 'project.aivproj')
    const invalidPath = join(directory, 'invalid.aivproj')
    try {
      const project = createEditingProject(source, { projectId: 'project-file', now: 123 })
      await writeFile(projectPath, serializeEditingProject(project), 'utf8')
      await writeFile(invalidPath, '{"schemaVersion": 999}', 'utf8')

      await expect(loadEditingProjectFile(projectPath)).resolves.toMatchObject({ filePath: projectPath, project: { id: 'project-file' } })
      await expect(loadEditingProjectFile(join(directory, 'missing.aivproj'))).rejects.toMatchObject({ code: 'INPUT_NOT_FOUND', filePath: join(directory, 'missing.aivproj') })
      await expect(loadEditingProjectFile(invalidPath)).rejects.toMatchObject({ code: 'INVALID_EDITING_PROJECT', filePath: invalidPath })
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
