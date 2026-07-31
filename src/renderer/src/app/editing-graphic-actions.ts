import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import { applyEditingGraphicTheme, createEditingGraphic, removeEditingGraphic, updateEditingGraphic as applyEditingGraphicUpdate } from '../../../core/editing/graphic-operations'
import { getEditingCaptionLayout } from '../../../core/editing/caption-layout'
import type { EditingCanvasPresetId, EditingCaptionEffect, EditingCaptionLayout, EditingFrameId, EditingGraphic, EditingGraphicPosition, EditingGraphicStyle } from '../../../shared/editing-types'
import type { AppModel } from './app-types'
import { saveEditingProject } from './editing-project-storage'
import { seekEditingTime } from './editing-action-helpers'

export function createEditingGraphicActions(model: AppModel) {
  const updateProject = (nextGraphics: EditingGraphic[], frameId?: EditingFrameId, captionEffect?: EditingCaptionEffect, canvasPreset?: EditingCanvasPresetId, captionLayout?: EditingCaptionLayout): void => {
    const project = model.editingProject
    const currentGraphics = project?.graphics ?? []
    if (!project || (frameId === undefined || frameId === project.frameId) && (captionEffect === undefined || captionEffect === project.captionEffect) && (canvasPreset === undefined || canvasPreset === project.canvasPreset) && (captionLayout === undefined || captionLayout === project.captionLayout) && nextGraphics.length === currentGraphics.length && nextGraphics.every((graphic, index) => graphic === currentGraphics[index])) return
    const nextProject = { ...project, updatedAt: Date.now(), graphics: nextGraphics, ...(frameId === undefined ? {} : { frameId }), ...(captionEffect === undefined ? {} : { captionEffect }), ...(canvasPreset === undefined ? {} : { canvasPreset }), ...(captionLayout === undefined ? {} : { captionLayout }) }
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

  const applyEditingGraphicThemeAction = (style: EditingGraphicStyle, position: EditingGraphicPosition): void => {
    const project = model.editingProject
    if (project) updateProject(applyEditingGraphicTheme(project.graphics ?? [], style, position))
  }

  const applyEditingFrameTheme = (frameId: EditingFrameId, style: EditingGraphicStyle, position: EditingGraphicPosition, captionEffect: EditingCaptionEffect): void => {
    const project = model.editingProject
    if (project) updateProject(applyEditingGraphicTheme(project.graphics ?? [], style, position), frameId, captionEffect)
  }

  const setEditingCaptionEffect = (captionEffect: EditingCaptionEffect): void => {
    const project = model.editingProject
    if (project && project.captionEffect !== captionEffect) updateProject(project.graphics ?? [], undefined, captionEffect)
  }

  const setEditingCanvasPreset = (canvasPreset: EditingCanvasPresetId): void => {
    const project = model.editingProject
    if (project && project.canvasPreset !== canvasPreset) updateProject(project.graphics ?? [], undefined, undefined, canvasPreset)
  }

  const setEditingCaptionLayout = (patch: Partial<EditingCaptionLayout>): void => {
    const project = model.editingProject
    if (!project) return
    const next = getEditingCaptionLayout({ ...getEditingCaptionLayout(project.captionLayout), ...patch })
    updateProject(project.graphics ?? [], undefined, undefined, undefined, next)
  }

  return { addEditingGraphic, selectEditingGraphic, deleteEditingGraphic, updateEditingGraphic, applyEditingGraphicTheme: applyEditingGraphicThemeAction, applyEditingFrameTheme, setEditingCaptionEffect, setEditingCanvasPreset, setEditingCaptionLayout }
}
