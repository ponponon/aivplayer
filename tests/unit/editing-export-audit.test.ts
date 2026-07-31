import { describe, expect, it } from 'vitest'
import { auditEditingExport } from '../../src/core/editing/export-audit'
import { createEditingProject } from '../../src/core/editing/project'
import type { EditingSource } from '../../src/shared/editing-types'

const source: EditingSource = { id: 'source-main', path: '/videos/main.mp4', name: 'main.mp4', fingerprint: 'main:12', durationSeconds: 12 }

describe('editing export audit', () => {
  it('passes a valid project and ignores unavailable unused sources', () => {
    const project = createEditingProject(source)
    const unused = { ...source, id: 'source-unused', path: '/videos/unused.mp4', name: 'unused.mp4', fingerprint: 'unused:8', durationSeconds: 8 }
    expect(auditEditingExport({ ...project, sources: [source, unused] }, [source.id]).errors).toEqual([])
  })

  it('reports missing files, invalid clip ranges, and too-short clips', () => {
    const project = createEditingProject(source)
    expect(auditEditingExport(project, []).errors).toMatchObject([{ code: 'missing-source-file', sourceName: 'main.mp4' }])
    expect(auditEditingExport({ ...project, videoClips: [{ ...project.videoClips[0]!, sourceEndSeconds: 13 }] }, [source.id]).errors).toMatchObject([{ code: 'invalid-clip-range' }])
    expect(auditEditingExport({ ...project, videoClips: [{ ...project.videoClips[0]!, sourceEndSeconds: 0.05 }] }, [source.id]).errors.some((issue) => issue.code === 'clip-too-short')).toBe(true)
  })

  it('audits overlay ranges and graphic timing before export', () => {
    const project = createEditingProject(source)
    const audited = auditEditingExport({ ...project, videoBlocks: [{ id: 'block-1', sourceId: source.id, sourceStartSeconds: 11, sourceEndSeconds: 12, startSeconds: 11, durationSeconds: 2, position: 'bottom-right' }], graphics: [{ id: 'graphic-1', startSeconds: 11, durationSeconds: 3, text: 'Title', position: 'center', style: 'title' }] }, [source.id])
    expect(audited.errors.map((issue) => issue.code)).toEqual(['invalid-video-block', 'invalid-graphic'])
  })
})
