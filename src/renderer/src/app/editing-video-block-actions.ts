import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import { createEditingVideoBlock, removeEditingVideoBlock, updateEditingVideoBlock as applyVideoBlockUpdate } from '../../../core/editing/video-block-operations'
import type { EditingVideoBlock, EditingVideoBlockPosition } from '../../../shared/editing-types'
import type { AppModel } from './app-types'
import { saveEditingProject } from './editing-project-storage'
import { seekEditingTime } from './editing-action-helpers'

export function createEditingVideoBlockActions(model: AppModel) {
  const updateProject = (nextBlocks: EditingVideoBlock[]): void => {
    const project = model.editingProject
    const currentBlocks = project?.videoBlocks ?? []
    if (!project || (nextBlocks.length === currentBlocks.length && nextBlocks.every((block, index) => block === currentBlocks[index]))) return
    const nextProject = { ...project, updatedAt: Date.now(), videoBlocks: nextBlocks }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const addEditingVideoBlock = (sourceId: string, options: { position: EditingVideoBlockPosition; startSeconds?: number }): void => {
    const project = model.editingProject
    const source = project?.sources.find((item) => item.id === sourceId)
    if (!project || !source) return
    const block = createEditingVideoBlock(source.id, source.durationSeconds, options.startSeconds ?? model.editingCurrentTime, editedDurationSeconds(project.videoClips), { position: options.position })
    if (!block) return
    updateProject([...(project.videoBlocks ?? []), block].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id)))
    model.setEditingSelectedVideoBlockId(block.id)
  }

  const selectEditingVideoBlock = (blockId: string): void => {
    const block = model.editingProject?.videoBlocks?.find((candidate) => candidate.id === blockId)
    if (block) { model.setEditingSelectedVideoBlockId(blockId); seekEditingTime(model, block.startSeconds) }
  }

  const deleteEditingVideoBlock = (blockId: string): void => {
    const project = model.editingProject
    if (project) { updateProject(removeEditingVideoBlock(project.videoBlocks ?? [], blockId)); if (model.editingSelectedVideoBlockId === blockId) model.setEditingSelectedVideoBlockId(null) }
  }

  const updateEditingVideoBlock = (blockId: string, patch: Partial<Pick<EditingVideoBlock, 'startSeconds' | 'durationSeconds' | 'position' | 'sourceStartSeconds' | 'sizePercent' | 'borderRadius' | 'borderWidth' | 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>): void => {
    const project = model.editingProject
    if (project) { updateProject(applyVideoBlockUpdate(project.videoBlocks ?? [], blockId, patch, editedDurationSeconds(project.videoClips), new Map(project.sources.map((source) => [source.id, source.durationSeconds])))); model.setEditingSelectedVideoBlockId(blockId) }
  }

  return { addEditingVideoBlock, selectEditingVideoBlock, deleteEditingVideoBlock, updateEditingVideoBlock }
}
