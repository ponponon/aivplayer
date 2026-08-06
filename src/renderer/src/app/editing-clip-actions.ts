import { getVideoClipSpans } from '../../../core/editing/timeline-math'
import { removeEditedVideoRange, reorderVideoClips, trimVideoClipBoundaryAtEdited, type EditingClipBoundary } from '../../../core/editing/timeline-operations'
import { updateEditingClipTreatment } from '../../../core/editing/treatment-operations'
import { updateEditingClipFilter } from '../../../core/editing/filter-operations'
import { updateEditingClipTransition } from '../../../core/editing/transition-operations'
import { updateEditingClipMotion } from '../../../core/editing/clip-motion'
import { updateEditingClipPersonMatte } from '../../../core/editing/person-matte-operations'
import type { EditingClipFilter, EditingClipTransition, EditingClipTreatment, EditingPersonMatte, EditingTreatmentAnchor, EditingVideoClip } from '../../../shared/editing-types'
import type { AppModel } from './app-types'
import { applyEditingTimelineChange, reorderEditingCaptions, seekEditingTime } from './editing-action-helpers'
import { saveEditingProject } from './editing-project-storage'

export function createEditingClipActions(model: AppModel) {
  const selectEditingClip = (clipId: string): void => {
    const project = model.editingProject
    const span = project ? getVideoClipSpans(project.videoClips).find((candidate) => candidate.clip.id === clipId) : null
    if (!project || !span) return
    model.setEditingClipPreview(null)
    model.setEditingSelectedClipId(clipId)
    seekEditingTime(model, span.editedStartSeconds, project)
  }

  const reorderEditingClips = (fromIndex: number, toIndex: number): void => {
    const project = model.editingProject
    if (!project) return
    const nextClips = reorderVideoClips(project.videoClips, fromIndex, toIndex)
    const moved = nextClips[toIndex]
    if (!moved || nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = {
      ...project,
      updatedAt: Date.now(),
      videoClips: nextClips,
      captions: reorderEditingCaptions(project.captions, project.videoClips, nextClips)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedClipId(moved.id)
    saveEditingProject(nextProject)
    const span = getVideoClipSpans(nextClips).find((candidate) => candidate.clip.id === moved.id)
    if (span) seekEditingTime(model, span.editedStartSeconds, nextProject)
  }

  const moveSelectedEditingClip = (direction: -1 | 1): void => {
    const project = model.editingProject
    const index = project?.videoClips.findIndex((clip) => clip.id === model.editingSelectedClipId) ?? -1
    if (index < 0) return
    reorderEditingClips(index, index + direction)
  }

  const deleteEditingRange = (startSeconds: number, endSeconds: number): void => {
    const project = model.editingProject
    if (!project) return
    const result = removeEditedVideoRange(project.videoClips, startSeconds, endSeconds)
    if (result.removedRange) applyEditingTimelineChange(model, result.clips, result.removedRange)
  }

  const updateEditingClipBoundary = (clipId: string, boundary: EditingClipBoundary, editedSeconds: number): void => {
    const project = model.editingProject
    if (!project) return
    const result = trimVideoClipBoundaryAtEdited(project.videoClips, clipId, boundary, editedSeconds)
    if (result.removedRange) applyEditingTimelineChange(model, result.clips, result.removedRange)
  }

  const setEditingClipTreatment = (clipId: string, treatment: EditingClipTreatment, scale?: number, anchor?: EditingTreatmentAnchor, size?: number): void => {
    model.setEditingClipPreview(null)
    const project = model.editingProject
    if (!project) return
    const nextClips = updateEditingClipTreatment(project.videoClips, clipId, treatment, scale, anchor, size)
    if (nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = { ...project, updatedAt: Date.now(), videoClips: nextClips }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const setEditingClipFilter = (clipId: string, filter: EditingClipFilter): void => {
    model.setEditingClipPreview(null)
    const project = model.editingProject
    if (!project) return
    const nextClips = updateEditingClipFilter(project.videoClips, clipId, filter)
    if (nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = { ...project, updatedAt: Date.now(), videoClips: nextClips }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const previewEditingClipTreatment = (clipId: string, treatment: EditingClipTreatment, scale?: number, anchor?: EditingTreatmentAnchor, size?: number): void => {
    if (!model.editingProject?.videoClips.some((clip) => clip.id === clipId)) return
    model.setEditingClipPreview({ clipId, treatment, treatmentScale: scale, treatmentAnchor: anchor, treatmentSize: size })
  }

  const previewEditingClipFilter = (clipId: string, filter: EditingClipFilter): void => {
    if (!model.editingProject?.videoClips.some((clip) => clip.id === clipId)) return
    model.setEditingClipPreview({ clipId, filter })
  }

  const setEditingClipTransition = (clipId: string, transition: EditingClipTransition | null): void => {
    const project = model.editingProject
    if (!project) return
    const nextClips = updateEditingClipTransition(project.videoClips, clipId, transition)
    if (nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = { ...project, updatedAt: Date.now(), videoClips: nextClips }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const setEditingClipMotion = (clipId: string, patch: Partial<Pick<EditingVideoClip, 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>): void => {
    const project = model.editingProject
    if (!project) return
    const nextClips = updateEditingClipMotion(project.videoClips, clipId, patch)
    if (nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = { ...project, updatedAt: Date.now(), videoClips: nextClips }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const setEditingClipPersonMatte = (clipId: string, personMatte: EditingPersonMatte): void => {
    const project = model.editingProject
    if (!project) return
    const nextClips = updateEditingClipPersonMatte(project.videoClips, clipId, personMatte)
    if (nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = { ...project, updatedAt: Date.now(), videoClips: nextClips }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  return { selectEditingClip, reorderEditingClips, moveSelectedEditingClip, deleteEditingRange, updateEditingClipBoundary, setEditingClipTreatment, setEditingClipFilter, previewEditingClipTreatment, previewEditingClipFilter, setEditingClipTransition, setEditingClipMotion, setEditingClipPersonMatte }
}
