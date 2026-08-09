import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import { moveEditingCaption as moveCaption, resizeEditingCaption as resizeCaption } from '../../../core/editing/caption-operations'
import { repairSubtitleQaIssues } from '../../../shared/subtitle-qa'
import type { SubtitleQaIssue } from '../../../shared/subtitle-qa'
import type { AppModel } from './app-types'
import { seekEditingTime } from './editing-action-helpers'
import { saveEditingProject } from './editing-project-storage'

export function createEditingCaptionActions(model: AppModel) {
  const selectEditingCaption = (captionId: string): void => {
    const project = model.editingProject
    const caption = project?.captions.find((item) => item.id === captionId)
    if (!project || !caption) return
    model.setEditingSelectedCaptionId(captionId)
    seekEditingTime(model, caption.startSeconds, project)
  }

  const moveEditingCaption = (captionId: string, startSeconds: number): void => {
    const project = model.editingProject
    if (!project) return
    const nextCaptions = moveCaption(project.captions, captionId, startSeconds, editedDurationSeconds(project.videoClips))
    if (nextCaptions.every((caption, index) => caption === project.captions[index])) return
    const nextProject = { ...project, captions: nextCaptions, updatedAt: Date.now() }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(captionId)
    saveEditingProject(nextProject)
  }

  const resizeEditingCaption = (captionId: string, startSeconds: number, endSeconds: number): void => {
    const project = model.editingProject
    if (!project) return
    const nextCaptions = resizeCaption(project.captions, captionId, startSeconds, endSeconds, editedDurationSeconds(project.videoClips))
    if (nextCaptions.every((caption, index) => caption === project.captions[index])) return
    const nextProject = { ...project, captions: nextCaptions, updatedAt: Date.now() }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(captionId)
    saveEditingProject(nextProject)
  }

  const repairEditingSubtitleQa = (issues: readonly SubtitleQaIssue[]): void => {
    const project = model.editingProject
    if (!project) return
    const nextCaptions = repairSubtitleQaIssues(project.captions, issues, editedDurationSeconds(project.videoClips))
    if (nextCaptions.every((caption, index) => caption === project.captions[index])) return
    const nextProject = { ...project, captions: nextCaptions, updatedAt: Date.now() }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  return { selectEditingCaption, moveEditingCaption, resizeEditingCaption, repairEditingSubtitleQa }
}
