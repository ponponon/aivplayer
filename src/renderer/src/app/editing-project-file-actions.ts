import { createEditingProject } from '../../../core/editing/project'
import { editedDurationSeconds } from '../../../core/editing/timeline-math'
import { countEditingSourceRepairUnportableCaptionPaths, matchEditingSourceRepairCandidates, relinkEditingProjectSources, type EditingSourceRepairMatch } from '../../../core/editing/source-repair'
import type { EditingProject } from '../../../shared/editing-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { clampEditingTime, createEditingSource, seekEditingTime } from './editing-action-helpers'
import { loadEditingProject, saveEditingProject } from './editing-project-storage'
import { syncPlayerPlayingState } from './playback-state'

type SelectFile = (file: NonNullable<AppModel['state']['currentFile']>) => void

function getCurrentSource(model: AppModel, derived: AppDerived) {
  const durationSeconds = Math.max(0, derived.mediaDurationSeconds ?? model.state.duration)
  return { source: createEditingSource(model, durationSeconds), durationSeconds }
}

function formatSourceRepairSummary(copy: AppDerived['copy']['editing'], sources: readonly EditingProject['sources'][number][], match: EditingSourceRepairMatch, sidecarResetCount = 0): string {
  const sourceNames = new Map(sources.map((source) => [source.id, source.name]))
  const mapped = match.replacements.map((replacement) => copy.projectRepairMapped(sourceNames.get(replacement.sourceId) ?? replacement.sourceId, replacement.path))
  const unresolved = match.unresolved.map((issue) => copy.projectRepairUnresolved(issue.sourceName))
  const ambiguous = match.ambiguous.map((issue) => copy.projectRepairAmbiguous(issue.sourceName, issue.candidatePaths))
  const sidecarReset = sidecarResetCount > 0 ? [copy.projectRepairSidecarReset(sidecarResetCount)] : []
  return [copy.projectRepairSummary(match.replacements.length, match.unresolved.length, match.ambiguous.length), ...mapped, ...unresolved, ...ambiguous, ...sidecarReset].join('；')
}

export function setEditingProject(model: AppModel, project: EditingProject, sourceTime = 0): void {
  const video = model.videoRef.current
  video?.pause()
  syncPlayerPlayingState(model.setState, video, () => model.videoRef.current)
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
    try {
      let project = result.project
      let repairSummary: string | null = null
      const availability = await Promise.all(project.sources.map(async (item) => ({ item, available: await window.aiv.isMediaFileAvailable(item.path) })))
      const missingSources = availability.filter(({ available }) => !available).map(({ item }) => item)
      if (missingSources.length > 0) {
        const missingSourceNames = missingSources.map((item) => item.name).join('、')
        model.setEditingProjectStatus({ success: false, message: `${derived.copy.editing.projectSourceMissing}：${missingSourceNames}` })
        const replacementFiles = await window.aiv.openMediaFiles()
        if (replacementFiles.length === 0) {
          model.setEditingProjectStatus({ success: false, message: derived.copy.editing.projectSourceMissing })
          return
        }
        const replacementMetadata = await Promise.all(replacementFiles.map((file) => window.aiv.getMediaMetadata(file.path)))
        const match = matchEditingSourceRepairCandidates(missingSources, replacementFiles.map((file, index) => ({ path: file.path, name: file.name, durationSeconds: replacementMetadata[index]?.durationSeconds ?? 0, width: replacementMetadata[index]?.video?.width ?? undefined, height: replacementMetadata[index]?.video?.height ?? undefined })))
        if (match.unresolvedSourceIds.length > 0 || match.ambiguousSourceIds.length > 0 || match.replacements.length !== missingSources.length) {
          model.setEditingProjectStatus({ success: false, message: formatSourceRepairSummary(derived.copy.editing, missingSources, match) })
          return
        }
        const repaired = relinkEditingProjectSources(project, match.replacements)
        if (!repaired) {
          model.setEditingProjectStatus({ success: false, message: derived.copy.editing.projectRepairFailed })
          return
        }
        repairSummary = formatSourceRepairSummary(derived.copy.editing, missingSources, match, countEditingSourceRepairUnportableCaptionPaths(project, match.replacements))
        project = repaired
      }
      const source = project.sources[0]
      if (!source) {
        model.setEditingProjectStatus({ success: false, message: derived.copy.editing.projectSourceMissing })
        return
      }
      const mediaFiles = await Promise.all(project.sources.map((item) => window.aiv.createMediaFile(item.path)))
      if (model.state.currentFile?.path !== source.path) selectFile(mediaFiles[0]!)
      model.setEditingSourceFiles(Object.fromEntries(project.sources.map((item, index) => [item.id, mediaFiles[index]!])) as Record<string, NonNullable<AppModel['state']['currentFile']>>)
      model.setEditingPreviewSourceId(source.id)
      model.setEditingProjectFilePath(result.filePath ?? null)
      model.setEditingProjectStatus({ success: true, message: repairSummary ? `${derived.copy.editing.projectOpened(project.title)}；${repairSummary}` : derived.copy.editing.projectOpened(project.title) })
      setEditingProject(model, project, 0)
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${derived.copy.editing.projectOpenFailed}：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  return { newEditingProject, resetEditingProject, saveEditingProjectFile, openEditingProjectFile }
}
