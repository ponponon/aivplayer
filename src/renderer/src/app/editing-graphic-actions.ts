import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import { createEditingGraphic, removeEditingGraphic, updateEditingGraphic as applyEditingGraphicUpdate } from '../../../core/editing/graphic-operations'
import type { EditingGraphic, EditingGraphicPosition, EditingGraphicStyle } from '../../../shared/editing-types'
import type { AppModel } from './app-types'
import { saveEditingProject } from './editing-project-storage'
import { seekEditingTime } from './editing-action-helpers'

export function createEditingGraphicActions(model: AppModel) {
  const updateProject = (nextGraphics: EditingGraphic[]): void => {
    const project = model.editingProject
    const currentGraphics = project?.graphics ?? []
    if (!project || (nextGraphics.length === currentGraphics.length && nextGraphics.every((graphic, index) => graphic === currentGraphics[index]))) return
    const nextProject = { ...project, updatedAt: Date.now(), graphics: nextGraphics }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const addEditingGraphic = (text: string, options: { position: EditingGraphicPosition; style: EditingGraphicStyle; durationSeconds: number }): void => {
    const project = model.editingProject
    if (!project) return
    const graphic = createEditingGraphic(text, model.editingCurrentTime, editedDurationSeconds(project.videoClips), options)
    if (!graphic) return
    updateProject([...(project.graphics ?? []), graphic].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)))
    model.setEditingSelectedGraphicId(graphic.id)
  }

  const selectEditingGraphic = (graphicId: string): void => {
    const graphic = model.editingProject?.graphics?.find((candidate) => candidate.id === graphicId)
    if (graphic) { model.setEditingSelectedGraphicId(graphicId); seekEditingTime(model, graphic.startSeconds) }
  }

  const deleteEditingGraphic = (graphicId: string): void => {
    const project = model.editingProject
    if (project) { updateProject(removeEditingGraphic(project.graphics ?? [], graphicId)); if (model.editingSelectedGraphicId === graphicId) model.setEditingSelectedGraphicId(null) }
  }

  const updateEditingGraphic = (graphicId: string, patch: Partial<Pick<EditingGraphic, 'text' | 'position' | 'style' | 'startSeconds' | 'durationSeconds'>>): void => {
    const project = model.editingProject
    if (project) { updateProject(applyEditingGraphicUpdate(project.graphics ?? [], graphicId, patch, editedDurationSeconds(project.videoClips))); model.setEditingSelectedGraphicId(graphicId) }
  }

  return { addEditingGraphic, selectEditingGraphic, deleteEditingGraphic, updateEditingGraphic }
}
