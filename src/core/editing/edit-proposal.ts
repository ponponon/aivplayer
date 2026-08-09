import { parseEditingProject } from './project-file'
import { removeEditingCaptionInterval } from './caption-operations'
import { removeSourceVideoRanges, type CreateRightClip } from './timeline-operations'
import { editedDurationSeconds, getVideoClipSpans, removeEditedInterval, sourceRangeToEditedRanges, type EditedRange } from './timeline-math'
import { isEditingScriptSegmentCaption } from './script-operations'
import type { EditingCaption, EditingProject, EditingScriptSegment } from '../../shared/editing-types'
import { EDITING_PROPOSAL_SCHEMA_VERSION, type EditingProposal, type EditingProposalCaptionDiff, type EditingProposalDiff, type EditingProposalOperation, type EditingProposalSegmentChange, type EditingProposalSourceRange, type EditingProposalTimelineSummary } from '../../shared/editing-proposal'

const EDITING_TIME_EPSILON_SECONDS = 0.001

export type EditingProposalErrorCode = 'EMPTY_SELECTION' | 'MISSING_SCRIPT_SEGMENT' | 'SCRIPT_SEGMENT_ALREADY_DELETED' | 'NO_EDITABLE_RANGE' | 'STALE_PROJECT'

export class EditingProposalError extends Error {
  readonly code: EditingProposalErrorCode
  readonly details?: unknown

  constructor(code: EditingProposalErrorCode, message: string, details?: unknown) {
    super(message)
    this.name = 'EditingProposalError'
    this.code = code
    this.details = details
  }
}

function roundSeconds(value: number): number {
  return Number(value.toFixed(3))
}

function hashText(value: string): string {
  let first = 0x811c9dc5
  let second = 0x9e3779b9
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index)
    first = Math.imul(first ^ code, 0x01000193)
    second = Math.imul(second ^ (code + index), 0x85ebca6b)
  }
  return `${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`
}

/** A deterministic project revision suitable for stale-proposal checks. */
export function getEditingProjectRevision(project: EditingProject): string {
  return hashText(JSON.stringify(parseEditingProject(project)))
}

function createProjectSnapshot(project: EditingProject): { projectId: string; schemaVersion: EditingProject['schemaVersion']; revision: string; updatedAt: number } {
  return { projectId: project.id, schemaVersion: project.schemaVersion, revision: getEditingProjectRevision(project), updatedAt: project.updatedAt }
}

function createDeterministicRightClip(proposalId: string): CreateRightClip {
  let sequence = 0
  return (base, sourceStartSeconds, sourceEndSeconds) => ({
    ...base,
    id: `clip-${proposalId.slice(-12)}-${sequence++}`,
    sourceStartSeconds,
    sourceEndSeconds
  })
}

function mergeSourceRanges(segments: readonly EditingScriptSegment[]): EditingProposalOperation[] {
  const sorted = [...segments].sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.sourceStartSeconds - right.sourceStartSeconds || left.sourceEndSeconds - right.sourceEndSeconds || left.id.localeCompare(right.id))
  const operations: EditingProposalOperation[] = []
  for (const segment of sorted) {
    const previous = operations.at(-1)
    if (previous && previous.sourceId === segment.sourceId && segment.sourceStartSeconds <= previous.sourceEndSeconds + EDITING_TIME_EPSILON_SECONDS) {
      previous.sourceEndSeconds = roundSeconds(Math.max(previous.sourceEndSeconds, segment.sourceEndSeconds))
      previous.scriptSegmentIds = [...new Set([...previous.scriptSegmentIds, segment.id])]
      continue
    }
    operations.push({
      type: 'delete-source-range',
      sourceId: segment.sourceId,
      sourceStartSeconds: roundSeconds(segment.sourceStartSeconds),
      sourceEndSeconds: roundSeconds(segment.sourceEndSeconds),
      scriptSegmentIds: [segment.id],
      reason: 'delete-script-segments'
    })
  }
  return operations
}

function collectRetainedSourceRanges(project: EditingProject, sourceId: string, scriptSegmentIds: readonly string[]): EditingProposalSourceRange[] {
  const ranges = getVideoClipSpans(project.videoClips)
    .filter((span) => span.clip.sourceId === sourceId)
    .map((span) => ({ startSeconds: span.clip.sourceStartSeconds, endSeconds: span.clip.sourceEndSeconds }))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  const merged = ranges.reduce<Array<{ startSeconds: number; endSeconds: number }>>((result, range) => {
    const previous = result.at(-1)
    if (previous && range.startSeconds <= previous.endSeconds + EDITING_TIME_EPSILON_SECONDS) previous.endSeconds = Math.max(previous.endSeconds, range.endSeconds)
    else result.push({ ...range })
    return result
  }, [])
  return merged.map((range) => ({
    sourceId,
    sourceStartSeconds: roundSeconds(range.startSeconds),
    sourceEndSeconds: roundSeconds(range.endSeconds),
    scriptSegmentIds: [...scriptSegmentIds],
    reason: 'delete-script-segments'
  }))
}

function summarizeProject(project: EditingProject): EditingProposalTimelineSummary {
  return {
    durationSeconds: roundSeconds(editedDurationSeconds(project.videoClips)),
    clipCount: project.videoClips.length,
    captionCount: project.captions.length,
    scriptSegmentCount: project.scriptSegments?.length ?? 0
  }
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function createCaptionDiff(before: readonly EditingCaption[], after: readonly EditingCaption[]): EditingProposalCaptionDiff {
  const afterById = new Map(after.map((caption) => [caption.id, caption]))
  const beforeById = new Map(before.map((caption) => [caption.id, caption]))
  return {
    beforeCount: before.length,
    afterCount: after.length,
    removedIds: before.filter((caption) => !afterById.has(caption.id)).map((caption) => caption.id).sort(),
    changedIds: before
      .filter((caption) => {
        const next = afterById.get(caption.id)
        return next !== undefined && !sameValue(caption, next)
      })
      .map((caption) => caption.id)
      .sort()
  }
}

function createSegmentChanges(before: readonly EditingScriptSegment[], after: readonly EditingScriptSegment[], ids: readonly string[]): EditingProposalSegmentChange[] {
  const afterById = new Map(after.map((segment) => [segment.id, segment]))
  return ids.map((id) => {
    const previous = before.find((segment) => segment.id === id)
    const next = afterById.get(id)
    if (!previous || !next) throw new Error(`Missing proposal segment after apply: ${id}`)
    return {
      id,
      sourceId: previous.sourceId,
      sourceStartSeconds: roundSeconds(previous.sourceStartSeconds),
      sourceEndSeconds: roundSeconds(previous.sourceEndSeconds),
      text: previous.text,
      translationText: previous.translationText ?? null,
      deletedBefore: previous.deleted === true,
      deletedAfter: next.deleted === true
    }
  })
}

type ApplyResult = {
  project: EditingProject
  removedRanges: EditedRange[]
}

function applyProposalInternal(project: EditingProject, proposal: EditingProposal, updatedAt = project.updatedAt): ApplyResult {
  const createRightClip = createDeterministicRightClip(proposal.id)
  let clips = [...project.videoClips]
  let captions = [...project.captions]
  let graphics = project.graphics ? [...project.graphics] : undefined
  let videoBlocks = project.videoBlocks ? [...project.videoBlocks] : undefined
  const removedRanges: EditedRange[] = []

  for (const operation of proposal.operations) {
    const result = removeSourceVideoRanges(clips, operation.sourceId, [{ startSeconds: operation.sourceStartSeconds, endSeconds: operation.sourceEndSeconds }], createRightClip)
    clips = result.clips
    for (const removedRange of [...result.removedRanges].sort((left, right) => right.startSeconds - left.startSeconds)) {
      captions = removeEditingCaptionInterval(captions, removedRange.startSeconds, removedRange.endSeconds)
      if (graphics) graphics = removeEditedInterval(graphics, removedRange.startSeconds, removedRange.endSeconds, 0.2)
      if (videoBlocks) videoBlocks = removeEditedInterval(videoBlocks, removedRange.startSeconds, removedRange.endSeconds, 0.2)
      removedRanges.push(removedRange)
    }
  }

  const targetSegmentIds = new Set(proposal.operations.flatMap((operation) => operation.scriptSegmentIds))
  const targetSegments = (project.scriptSegments ?? []).filter((segment) => targetSegmentIds.has(segment.id))
  captions = captions.filter((caption) => !targetSegments.some((segment) => isEditingScriptSegmentCaption(caption, segment)))
  const scriptSegments = project.scriptSegments?.map((segment) => targetSegmentIds.has(segment.id) ? { ...segment, deleted: true } : segment)
  const nextProject = parseEditingProject({
    ...project,
    updatedAt,
    videoClips: clips,
    captions,
    ...(graphics === undefined ? {} : { graphics }),
    ...(videoBlocks === undefined ? {} : { videoBlocks }),
    ...(scriptSegments === undefined ? {} : { scriptSegments })
  })
  return { project: nextProject, removedRanges }
}

export function buildDeleteScriptProposal(project: EditingProject, segmentIds: readonly string[]): EditingProposal {
  const uniqueIds = [...new Set(segmentIds)].sort()
  if (uniqueIds.length === 0) throw new EditingProposalError('EMPTY_SELECTION', '至少需要一个脚本行 ID')
  const segments = uniqueIds.map((id) => {
    const segment = project.scriptSegments?.find((item) => item.id === id)
    if (!segment) throw new EditingProposalError('MISSING_SCRIPT_SEGMENT', `找不到脚本行：${id}`, { segmentId: id })
    if (segment.deleted) throw new EditingProposalError('SCRIPT_SEGMENT_ALREADY_DELETED', `脚本行已经删除：${id}`, { segmentId: id })
    if (sourceRangeToEditedRanges(project.videoClips, segment.sourceId, segment.sourceStartSeconds, segment.sourceEndSeconds).length === 0) throw new EditingProposalError('NO_EDITABLE_RANGE', `脚本行没有可删除的成片区间：${id}`, { segmentId: id })
    return segment
  }).sort((left, right) => left.sourceId.localeCompare(right.sourceId) || left.sourceStartSeconds - right.sourceStartSeconds || left.id.localeCompare(right.id))
  const operations = mergeSourceRanges(segments)
  const base = createProjectSnapshot(project)
  const proposalId = `proposal-${hashText(JSON.stringify({ base, operations }))}`
  const provisional: EditingProposal = {
    schemaVersion: EDITING_PROPOSAL_SCHEMA_VERSION,
    id: proposalId,
    kind: 'delete-script-segments',
    title: '删除脚本行',
    summary: `删除 ${segments.length} 行脚本，并从主时间线移除对应源区间`,
    base,
    operations,
    diff: {
      before: summarizeProject(project),
      after: summarizeProject(project),
      durationDeltaSeconds: 0,
      removedEditedRanges: [],
      removedSourceRanges: [],
      retainedSourceRanges: [],
      scriptSegments: [],
      captions: { beforeCount: project.captions.length, afterCount: project.captions.length, removedIds: [], changedIds: [] }
    },
    resultRevision: base.revision
  }
  const applied = applyProposalInternal(project, provisional)
  if (applied.removedRanges.length === 0) throw new EditingProposalError('NO_EDITABLE_RANGE', '所选脚本行没有产生可删除的主时间线区间')
  const sourceIds = [...new Set(operations.map((operation) => operation.sourceId))].sort()
  const retainedSourceRanges = sourceIds.flatMap((sourceId) => collectRetainedSourceRanges(applied.project, sourceId, operations.filter((operation) => operation.sourceId === sourceId).flatMap((operation) => operation.scriptSegmentIds)))
  const removedEditedRanges = operations
    .flatMap((operation) => sourceRangeToEditedRanges(project.videoClips, operation.sourceId, operation.sourceStartSeconds, operation.sourceEndSeconds))
    .sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
  const diff: EditingProposalDiff = {
    before: summarizeProject(project),
    after: summarizeProject(applied.project),
    durationDeltaSeconds: roundSeconds(editedDurationSeconds(applied.project.videoClips) - editedDurationSeconds(project.videoClips)),
    removedEditedRanges: removedEditedRanges.map((range) => ({ startSeconds: roundSeconds(range.startSeconds), endSeconds: roundSeconds(range.endSeconds) })),
    removedSourceRanges: operations.map((operation) => ({ sourceId: operation.sourceId, sourceStartSeconds: roundSeconds(operation.sourceStartSeconds), sourceEndSeconds: roundSeconds(operation.sourceEndSeconds), scriptSegmentIds: [...operation.scriptSegmentIds], reason: operation.reason })),
    retainedSourceRanges,
    scriptSegments: createSegmentChanges(project.scriptSegments ?? [], applied.project.scriptSegments ?? [], segments.map((segment) => segment.id)),
    captions: createCaptionDiff(project.captions, applied.project.captions)
  }
  const resultRevision = getEditingProjectRevision(applied.project)
  return { ...provisional, diff, resultRevision }
}

export function applyEditingProposal(project: EditingProject, proposal: EditingProposal, options: { updatedAt?: number } = {}): EditingProject {
  if (proposal.schemaVersion !== EDITING_PROPOSAL_SCHEMA_VERSION || proposal.base.projectId !== project.id || proposal.base.revision !== getEditingProjectRevision(project)) throw new EditingProposalError('STALE_PROJECT', '工程已发生变化，不能应用这个 Proposal', { expectedRevision: proposal.base.revision, actualRevision: getEditingProjectRevision(project) })
  const applied = applyProposalInternal(project, proposal, options.updatedAt ?? project.updatedAt)
  if (getEditingProjectRevision(applied.project) !== proposal.resultRevision && options.updatedAt === undefined) throw new EditingProposalError('STALE_PROJECT', 'Proposal 结果校验失败')
  return applied.project
}
