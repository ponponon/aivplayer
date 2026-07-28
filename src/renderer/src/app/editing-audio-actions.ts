import { toggleEditingClipMuted, updateEditingClipVolume } from '../../../core/editing/audio-operations'
import type { AppModel } from './app-types'
import { saveEditingProject } from './editing-project-storage'

export function createEditingAudioActions(model: AppModel) {
  const updateAudio = (nextClips: NonNullable<AppModel['editingProject']>['videoClips']): void => {
    const project = model.editingProject
    if (!project || nextClips.every((clip, index) => clip === project.videoClips[index])) return
    const nextProject = { ...project, videoClips: nextClips, updatedAt: Date.now() }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    saveEditingProject(nextProject)
  }

  const setEditingClipVolume = (clipId: string, volume: number): void => {
    const project = model.editingProject
    if (project) updateAudio(updateEditingClipVolume(project.videoClips, clipId, volume))
  }

  const toggleEditingClipMute = (clipId: string): void => {
    const project = model.editingProject
    if (project) updateAudio(toggleEditingClipMuted(project.videoClips, clipId))
  }

  return { setEditingClipVolume, toggleEditingClipMute }
}
