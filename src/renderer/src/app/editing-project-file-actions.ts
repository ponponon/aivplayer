import { createEditingProject } from '../../../core/editing/project'
import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import type { EditingProject } from '../../../shared/editing-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { clampEditingTime, createEditingSource, seekEditingTime } from './editing-action-helpers'
import { loadEditingProject, saveEditingProject } from './editing-project-storage'

type SelectFile = (file: NonNullable<AppModel['state']['currentFile']>) => void

function getCurrentSource(model: AppModel, derived: AppDerived) {
  const durationSeconds = Math.max(0, derived.mediaDurationSeconds ?? model.state.duration)
  return { source: createEditingSource(model, durationSeconds), durationSeconds }
}

export function setEditingProject(model: AppModel, project: EditingProject, sourceTime = 0): void {
  model.videoRef.current?.pause()
  model.setEditingProject(project)
  model.setEditingPast([])
  model.setEditingFuture([])
  model.setEditingCurrentTime(clampEditingTime(sourceTime, editedDurationSeconds(project.videoClips)))
  model.setEditingSelectedClipId(null)
  model.setEditingSelectedCaptionId(null)
  model.setEditingSelectedGraphicId(null)
  model.setEditingSelectedVideoBlockId(null)
  model.setIsEditingMode(true)
  saveEditingProject(project)
  seekEditingTime(model, sourceTime, project)
}

export function createEditingProjectFileActions(model: AppModel, derived: AppDerived, selectFile: SelectFile) {
  const confirmFreshProject = (): boolean => !model.editingProject || model.editingPast.length === 0 || window.confirm(derived.copy.editing.resetConfirm)

  const createFreshEditingProject = (status: string): void => {
    const { source } = getCurrentSource(model, derived)
    if (!source) return
    const project = createEditingProject(source)
    if (model.state.currentFile) model.setEditingSourceFiles({ [source.id]: model.state.currentFile })
    model.setEditingPreviewSourceId(source.id)
    model.setEditingProjectFilePath(null)
    model.setEditingProjectStatus({ success: true, message: status })
    setEditingProject(model, project, 0)
  }

  const resetEditingProject = (): void => {
    if (!confirmFreshProject()) return
    createFreshEditingProject(derived.copy.editing.projectReset)
  }

  const newEditingProject = (): void => {
    if (!confirmFreshProject()) return
    createFreshEditingProject(derived.copy.editing.projectCreated)
  }

  const saveEditingProjectFile = async (): Promise<void> => {
    const project = model.editingProject
    if (!project) return
    const result = await window.aiv.saveEditingProject({ project, suggestedPath: model.editingProjectFilePath ?? undefined })
    if (result.canceled) return
    if (!result.success) {
      model.setEditingProjectStatus({ success: false, message: result.message || derived.copy.editing.projectSaveFailed })
      return
    }
    model.setEditingProjectFilePath(result.filePath ?? null)
    model.setEditingProjectStatus({ success: true, message: derived.copy.editing.projectSaved(result.filePath ?? project.title) })
  }

  const openEditingProjectFile = async (): Promise<void> => {
    const result = await window.aiv.openEditingProject()
    if (result.canceled) return
    if (!result.success || !result.project) {
      model.setEditingProjectStatus({ success: false, message: result.message || derived.copy.editing.projectOpenFailed })
      return
    }
    const source = result.project.sources[0]
    if (!source) {
      model.setEditingProjectStatus({ success: false, message: derived.copy.editing.projectSourceMissing })
      return
    }
    try {
      const availability = await Promise.all(result.project.sources.map(async (item) => ({ item, available: await window.aiv.isMediaFileAvailable(item.path) })))
      if (availability.some(({ available }) => !available)) {
        model.setEditingProjectStatus({ success: false, message: derived.copy.editing.projectSourceMissing })
        return
      }
      const mediaFiles = await Promise.all(result.project.sources.map((item) => window.aiv.createMediaFile(item.path)))
      if (model.state.currentFile?.path !== source.path) selectFile(mediaFiles[0]!)
      model.setEditingSourceFiles(Object.fromEntries(result.project.sources.map((item, index) => [item.id, mediaFiles[index]!])) as Record<string, NonNullable<AppModel['state']['currentFile']>>)
      model.setEditingPreviewSourceId(source.id)
      model.setEditingProjectFilePath(result.filePath ?? null)
      model.setEditingProjectStatus({ success: true, message: derived.copy.editing.projectOpened(result.project.title) })
      setEditingProject(model, result.project, 0)
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${derived.copy.editing.projectOpenFailed}：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  return { newEditingProject, resetEditingProject, saveEditingProjectFile, openEditingProjectFile }
}
