import { describe, expect, it } from 'vitest'
import { applyEditingProposal, buildDeleteScriptProposal, EditingProposalError } from '../../src/core/editing/edit-proposal'
import { createEditingProject } from '../../src/core/editing/project'
import type { EditingProject, EditingScriptSegment, EditingSource } from '../../src/shared/editing-types'

const source: EditingSource = {
  id: 'source-main',
  path: '/videos/interview.mp4',
  name: 'interview.mp4',
  fingerprint: '/videos/interview.mp4:20',
  durationSeconds: 20,
  width: 1920,
  height: 1080
}

function createProposalProject(): EditingProject {
  const project = createEditingProject(source, { projectId: 'project-proposal', clipId: 'clip-main', now: 123 })
  const scriptSegments: EditingScriptSegment[] = [
    { id: 'segment-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, text: '第一句', translationText: 'First sentence' },
    { id: 'segment-2', sourceId: source.id, sourceStartSeconds: 5, sourceEndSeconds: 6, text: '第二句', translationText: 'Second sentence' },
    { id: 'segment-3', sourceId: source.id, sourceStartSeconds: 8, sourceEndSeconds: 10, text: '保留这一句', translationText: 'Keep this sentence' }
  ]
  return {
    ...project,
    title: 'Proposal test',
    scriptSegments,
    captions: [
      { id: 'segment-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 1, durationSeconds: 2, text: '第一句', kind: 'source' },
      { id: 'translation-segment-1', sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, startSeconds: 1, durationSeconds: 2, text: 'First sentence', kind: 'translation' },
      { id: 'segment-2', sourceId: source.id, sourceStartSeconds: 5, sourceEndSeconds: 6, startSeconds: 5, durationSeconds: 1, text: '第二句', kind: 'source' },
      { id: 'translation-segment-2', sourceId: source.id, sourceStartSeconds: 5, sourceEndSeconds: 6, startSeconds: 5, durationSeconds: 1, text: 'Second sentence', kind: 'translation' },
      { id: 'segment-3', sourceId: source.id, sourceStartSeconds: 8, sourceEndSeconds: 10, startSeconds: 8, durationSeconds: 2, text: '保留这一句', kind: 'source' }
    ]
  }
}

describe('editing Proposal / Diff', () => {
  it('generates deterministic delete-script diff in original coordinates', () => {
    const project = createProposalProject()
    const proposal = buildDeleteScriptProposal(project, ['segment-2', 'segment-1'])
    const repeated = buildDeleteScriptProposal(project, ['segment-1', 'segment-2'])

    expect(proposal).toEqual(repeated)
    expect(proposal.kind).toBe('delete-script-segments')
    expect(proposal.operations).toMatchObject([
      { sourceId: source.id, sourceStartSeconds: 1, sourceEndSeconds: 3, scriptSegmentIds: ['segment-1'] },
      { sourceId: source.id, sourceStartSeconds: 5, sourceEndSeconds: 6, scriptSegmentIds: ['segment-2'] }
    ])
    expect(proposal.diff).toMatchObject({
      before: { durationSeconds: 20, clipCount: 1, captionCount: 5, scriptSegmentCount: 3 },
      after: { durationSeconds: 17, clipCount: 3, captionCount: 1, scriptSegmentCount: 3 },
      durationDeltaSeconds: -3,
      removedEditedRanges: [
        { startSeconds: 1, endSeconds: 3 },
        { startSeconds: 5, endSeconds: 6 }
      ],
      captions: {
        beforeCount: 5,
        afterCount: 1,
        removedIds: ['segment-1', 'segment-2', 'translation-segment-1', 'translation-segment-2'],
        changedIds: ['segment-3']
      }
    })
    expect(proposal.diff.retainedSourceRanges).toMatchObject([
      { sourceStartSeconds: 0, sourceEndSeconds: 1 },
      { sourceStartSeconds: 3, sourceEndSeconds: 5 },
      { sourceStartSeconds: 6, sourceEndSeconds: 20 }
    ])
    expect(proposal.diff.scriptSegments).toEqual([
      expect.objectContaining({ id: 'segment-1', deletedBefore: false, deletedAfter: true }),
      expect.objectContaining({ id: 'segment-2', deletedBefore: false, deletedAfter: true })
    ])
  })

  it('applies a proposal only to the same project revision', () => {
    const project = createProposalProject()
    const proposal = buildDeleteScriptProposal(project, ['segment-1', 'segment-2'])
    const applied = applyEditingProposal(project, proposal)

    expect(applied.updatedAt).toBe(project.updatedAt)
    expect(applied.videoClips).toHaveLength(3)
    expect(applied.scriptSegments?.filter((segment) => segment.deleted).map((segment) => segment.id)).toEqual(['segment-1', 'segment-2'])
    expect(applied.captions).toMatchObject([
      { id: 'segment-3', startSeconds: 5, durationSeconds: 2, text: '保留这一句' }
    ])

    expect(() => applyEditingProposal({ ...project, title: '工程已被修改' }, proposal)).toThrowError(EditingProposalError)
    expect(() => applyEditingProposal({ ...project, title: '工程已被修改' }, proposal)).toThrowError(/工程已发生变化/)
  })

  it('reports invalid segment selections before producing a proposal', () => {
    const project = createProposalProject()
    expect(() => buildDeleteScriptProposal(project, [])).toThrowError(expect.objectContaining({ code: 'EMPTY_SELECTION' }))
    expect(() => buildDeleteScriptProposal(project, ['missing'])).toThrowError(expect.objectContaining({ code: 'MISSING_SCRIPT_SEGMENT' }))
    expect(() => buildDeleteScriptProposal({ ...project, scriptSegments: [{ ...project.scriptSegments![0]!, deleted: true }, ...project.scriptSegments!.slice(1)] }, ['segment-1']))
      .toThrowError(expect.objectContaining({ code: 'SCRIPT_SEGMENT_ALREADY_DELETED' }))
  })
})
