import { describe, expect, it } from 'vitest'
import { createEditingProject } from '../../src/core/editing/project'
import { duplicateEditingSelection, moveEditingSelection } from '../../src/core/editing/selection-operations'
import type { EditingSelection } from '../../src/core/editing/selection'

const project = createEditingProject({ id: 'source', path: '/tmp/demo.mp4', name: 'demo.mp4', fingerprint: 'demo', durationSeconds: 10 })

describe('editing selection operations', () => {
  it('moves selected captions, graphics, and video blocks by one shared delta', () => {
    const input = {
      ...project,
      captions: [{ id: 'caption', sourceId: 'source', sourceStartSeconds: 1, sourceEndSeconds: 2, startSeconds: 1, durationSeconds: 1, kind: 'source' as const, text: 'hello' }],
      graphics: [{ id: 'graphic', startSeconds: 3, durationSeconds: 2, text: 'title', position: 'center' as const, style: 'title' as const }],
      videoBlocks: [{ id: 'block', sourceId: 'source', sourceStartSeconds: 0, sourceEndSeconds: 2, startSeconds: 5, durationSeconds: 2, position: 'bottom-right' as const }],
    }
    const selection: EditingSelection = { clipIds: [], captionIds: ['caption'], graphicIds: ['graphic'], videoBlockIds: ['block'] }
    const next = moveEditingSelection(input, selection, 1)
    expect(next.captions[0]).toMatchObject({ startSeconds: 2 })
    expect(next.captions[0]).not.toHaveProperty('sourceId')
    expect(next.graphics?.[0]).toMatchObject({ startSeconds: 4 })
    expect(next.videoBlocks?.[0]).toMatchObject({ startSeconds: 6 })
  })

  it('clamps the group at the nearest timeline boundary and ignores primary clips', () => {
    const input = {
      ...project,
      videoClips: [{ ...project.videoClips[0]!, sourceEndSeconds: 10 }],
      graphics: [{ id: 'graphic', startSeconds: 8, durationSeconds: 2, text: 'title', position: 'center' as const, style: 'title' as const }],
    }
    const selection: EditingSelection = { clipIds: ['clip-1'], captionIds: [], graphicIds: ['graphic'], videoBlockIds: [] }
    const next = moveEditingSelection(input, selection, 10)
    expect(next.graphics?.[0]?.startSeconds).toBe(8)
    expect(next.videoClips).toBe(input.videoClips)
  })

  it('duplicates selected overlays after their shared span and selects the copies', () => {
    const input = {
      ...project,
      captions: [{ id: 'caption', sourceId: 'source', sourceStartSeconds: 1, sourceEndSeconds: 2, startSeconds: 1, durationSeconds: 1, kind: 'source' as const, text: 'hello' }],
      graphics: [{ id: 'graphic', startSeconds: 1, durationSeconds: 1, text: 'title', position: 'center' as const, style: 'title' as const }],
      videoBlocks: [{ id: 'block', sourceId: 'source', sourceStartSeconds: 0, sourceEndSeconds: 1, startSeconds: 3, durationSeconds: 1, position: 'bottom-right' as const }],
    }
    const result = duplicateEditingSelection(input, { clipIds: ['clip-1'], captionIds: ['caption'], graphicIds: ['graphic'], videoBlockIds: ['block'] })
    expect(result).not.toBeNull()
    expect(result?.project.captions).toHaveLength(2)
    expect(result?.project.graphics).toHaveLength(2)
    expect(result?.project.videoBlocks).toHaveLength(2)
    expect(result?.project.captions[1]).toMatchObject({ startSeconds: 4, text: 'hello' })
    expect(result?.project.captions[1]).not.toHaveProperty('sourceId')
    expect(result?.selection.clipIds).toEqual([])
    expect(result?.selection.captionIds).toHaveLength(1)
    expect(result?.selection.graphicIds).toHaveLength(1)
    expect(result?.selection.videoBlockIds).toHaveLength(1)
  })
})
