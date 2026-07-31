import { deleteVideoClipsById } from '../../../core/editing/timeline-operations'
import { duplicateEditingSelection as applyEditingSelectionDuplicate, moveEditingSelection as applyEditingSelectionMove } from '../../../core/editing/selection-operations'
import { reorderEditingOverlayTracks as applyEditingOverlayTrackReorder } from '../../../core/editing/overlay-track-operations'
import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import type { EditingSelection } from '../../../core/editing/selection'
import type { EditingOverlayTrackKind, EditingProject } from '../../../shared/editing-types'
import type { AppModel } from './app-types'
import { seekEditingTime, withUpdatedTimelineRanges } from './editing-action-helpers'
import { saveEditingProject } from './editing-project-storage'

function removeSelected<T extends { id: string }>(items: readonly T[] | undefined, ids: readonly string[]): T[] | undefined {
  if (!items) return undefined
  const selected = new Set(ids)
  return items.filter((item) => !selected.has(item.id))
}

function mapTimeAfterRemovedRanges(seconds: number, ranges: readonly { startSeconds: number; endSeconds: number }[]): number {
  let next = Math.max(0, seconds)
  for (const range of [...ranges].sort((left, right) => left.startSeconds - right.startSeconds)) {
    const duration = Math.max(0, range.endSeconds - range.startSeconds)
    if (next <= range.startSeconds) continue
    if (next < range.endSeconds) return range.startSeconds
    next -= duration
  }
  return next
}

function hasChanged<T>(before: readonly T[] | undefined, after: readonly T[] | undefined): boolean {
  if (before === undefined || after === undefined) return before !== after
  return before.length !== after.length || before.some((item, index) => item !== after[index])
}

/** Applies one undoable batch to the non-persisted timeline selection. */
export function deleteEditingSelection(model: AppModel, selection: EditingSelection): void {
  const project = model.editingProject
  if (!project) return

  const clipResult = deleteVideoClipsById(project.videoClips, selection.clipIds)
  const timelineProject = clipResult.removedRanges.length > 0
    ? withUpdatedTimelineRanges(project, clipResult.clips, clipResult.removedRanges)
    : project
  const nextProject: EditingProject = {
    ...timelineProject,
    captions: removeSelected(timelineProject.captions, selection.captionIds) ?? [],
    ...(timelineProject.graphics === undefined ? {} : { graphics: removeSelected(timelineProject.graphics, selection.graphicIds) }),
    ...(timelineProject.videoBlocks === undefined ? {} : { videoBlocks: removeSelected(timelineProject.videoBlocks, selection.videoBlockIds) }),
    updatedAt: Date.now(),
  }
  const changed = clipResult.removedRanges.length > 0
    || hasChanged(timelineProject.captions, nextProject.captions)
    || hasChanged(timelineProject.graphics, nextProject.graphics)
    || hasChanged(timelineProject.videoBlocks, nextProject.videoBlocks)
  if (!changed) return

  model.setEditingPast((past) => [...past, project])
  model.setEditingFuture([])
  model.setEditingProject(nextProject)
  if (model.editingSelectedClipId && !nextProject.videoClips.some((clip) => clip.id === model.editingSelectedClipId)) model.setEditingSelectedClipId(null)
  if (model.editingSelectedCaptionId && !nextProject.captions.some((caption) => caption.id === model.editingSelectedCaptionId)) model.setEditingSelectedCaptionId(null)
  if (model.editingSelectedGraphicId && !nextProject.graphics?.some((graphic) => graphic.id === model.editingSelectedGraphicId)) model.setEditingSelectedGraphicId(null)
  if (model.editingSelectedVideoBlockId && !nextProject.videoBlocks?.some((block) => block.id === model.editingSelectedVideoBlockId)) model.setEditingSelectedVideoBlockId(null)
  saveEditingProject(nextProject)

  const nextDuration = editedDurationSeconds(nextProject.videoClips)
  const nextTime = clipResult.removedRanges.length > 0
    ? mapTimeAfterRemovedRanges(model.editingCurrentTime, clipResult.removedRanges)
    : model.editingCurrentTime
  seekEditingTime(model, Math.min(nextTime, nextDuration), nextProject)
}

/** Moves selected overlay elements together without changing primary-track clip order. */
export function moveEditingSelection(model: AppModel, selection: EditingSelection, deltaSeconds: number): void {
  const project = model.editingProject
  if (!project) return
  const nextProject = applyEditingSelectionMove(project, selection, deltaSeconds)
  if (nextProject === project) return
  model.setEditingPast((past) => [...past, project])
  model.setEditingFuture([])
  model.setEditingProject(nextProject)
  saveEditingProject(nextProject)
}

/** Duplicates selected overlay elements as one undoable batch and returns the new selection. */
export function duplicateEditingSelection(model: AppModel, selection: EditingSelection): EditingSelection | null {
  const project = model.editingProject
  if (!project) return null
  const result = applyEditingSelectionDuplicate(project, selection)
  if (!result) return null
  model.setEditingPast((past) => [...past, project])
  model.setEditingFuture([])
  model.setEditingProject(result.project)
  saveEditingProject(result.project)
  return result.selection
}

/** Reorders the overlay tracks as one undoable project change. */
export function reorderEditingOverlayTracks(model: AppModel, source: EditingOverlayTrackKind, target: EditingOverlayTrackKind): void {
  const project = model.editingProject
  if (!project) return
  const nextProject = applyEditingOverlayTrackReorder(project, source, target)
  if (nextProject === project) return
  model.setEditingPast((past) => [...past, project])
  model.setEditingFuture([])
  model.setEditingProject(nextProject)
  saveEditingProject(nextProject)
}
