import { editedDurationSeconds } from './timeline-math'
import type { EditingSelection } from './selection'
import type { EditingCaption, EditingProject } from '../../shared/editing-types'

type TimedOverlay = { startSeconds: number; durationSeconds: number }

function clampGroupDelta(items: readonly TimedOverlay[], requestedDelta: number, timelineDuration: number): number {
  if (items.length === 0 || !Number.isFinite(requestedDelta)) return 0
  const lowerBound = Math.max(...items.map((item) => -item.startSeconds))
  const upperBound = Math.min(...items.map((item) => timelineDuration - item.startSeconds - item.durationSeconds))
  return Math.min(upperBound, Math.max(lowerBound, requestedDelta))
}

function moveCaption(caption: EditingCaption, deltaSeconds: number): EditingCaption {
  const { sourceId: _sourceId, sourceStartSeconds: _sourceStartSeconds, sourceEndSeconds: _sourceEndSeconds, ...unanchored } = caption
  return { ...unanchored, startSeconds: caption.startSeconds + deltaSeconds }
}

function duplicateId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function duplicateCaption(caption: EditingCaption, startSeconds: number): EditingCaption {
  const { id: _id, sourceId: _sourceId, sourceStartSeconds: _sourceStartSeconds, sourceEndSeconds: _sourceEndSeconds, ...unanchored } = caption
  return { ...unanchored, id: duplicateId('caption'), startSeconds }
}

/** Moves selected overlay elements as one group while preserving their relative spacing. */
export function moveEditingSelection(project: EditingProject, selection: EditingSelection, requestedDelta: number): EditingProject {
  const captionIds = new Set(selection.captionIds)
  const graphicIds = new Set(selection.graphicIds)
  const videoBlockIds = new Set(selection.videoBlockIds)
  const selectedCaptions = project.captions.filter((caption) => captionIds.has(caption.id))
  const selectedGraphics = (project.graphics ?? []).filter((graphic) => graphicIds.has(graphic.id))
  const selectedVideoBlocks = (project.videoBlocks ?? []).filter((block) => videoBlockIds.has(block.id))
  const items = [...selectedCaptions, ...selectedGraphics, ...selectedVideoBlocks]
  const deltaSeconds = clampGroupDelta(items, requestedDelta, editedDurationSeconds(project.videoClips))
  if (Math.abs(deltaSeconds) < 0.001) return project

  const captions = project.captions.map((caption) => captionIds.has(caption.id) ? moveCaption(caption, deltaSeconds) : caption)
  const graphics = project.graphics?.map((graphic) => graphicIds.has(graphic.id) ? { ...graphic, startSeconds: graphic.startSeconds + deltaSeconds } : graphic)
  const videoBlocks = project.videoBlocks?.map((block) => videoBlockIds.has(block.id) ? { ...block, startSeconds: block.startSeconds + deltaSeconds } : block)
  return {
    ...project,
    captions,
    ...(graphics === undefined ? {} : { graphics }),
    ...(videoBlocks === undefined ? {} : { videoBlocks }),
    updatedAt: Date.now(),
  }
}

/** Duplicates selected overlay elements immediately after their shared time span and selects the copies. */
export function duplicateEditingSelection(project: EditingProject, selection: EditingSelection): { project: EditingProject; selection: EditingSelection } | null {
  const captionIds = new Set(selection.captionIds)
  const graphicIds = new Set(selection.graphicIds)
  const videoBlockIds = new Set(selection.videoBlockIds)
  const selectedCaptions = project.captions.filter((caption) => captionIds.has(caption.id))
  const selectedGraphics = (project.graphics ?? []).filter((graphic) => graphicIds.has(graphic.id))
  const selectedVideoBlocks = (project.videoBlocks ?? []).filter((block) => videoBlockIds.has(block.id))
  const items = [...selectedCaptions, ...selectedGraphics, ...selectedVideoBlocks]
  if (items.length === 0) return null
  const minStart = Math.min(...items.map((item) => item.startSeconds))
  const maxEnd = Math.max(...items.map((item) => item.startSeconds + item.durationSeconds))
  const groupDuration = maxEnd - minStart
  const timelineDuration = editedDurationSeconds(project.videoClips)
  if (!Number.isFinite(groupDuration) || groupDuration < 0.001 || maxEnd + groupDuration > timelineDuration + 0.001) return null

  const captions = selectedCaptions.map((caption) => duplicateCaption(caption, caption.startSeconds + groupDuration))
  const graphics = selectedGraphics.map((graphic) => ({ ...graphic, id: duplicateId('graphic'), startSeconds: graphic.startSeconds + groupDuration }))
  const videoBlocks = selectedVideoBlocks.map((block) => ({ ...block, id: duplicateId('video-block'), startSeconds: block.startSeconds + groupDuration }))
  return {
    project: {
      ...project,
      captions: [...project.captions, ...captions].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)),
      ...(project.graphics === undefined ? {} : { graphics: [...project.graphics, ...graphics].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)) }),
      ...(project.videoBlocks === undefined ? {} : { videoBlocks: [...project.videoBlocks, ...videoBlocks].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)) }),
      updatedAt: Date.now(),
    },
    selection: { clipIds: [], captionIds: captions.map((caption) => caption.id), graphicIds: graphics.map((graphic) => graphic.id), videoBlockIds: videoBlocks.map((block) => block.id) },
  }
}
