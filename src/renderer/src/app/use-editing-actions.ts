import { useEffect } from 'react'
import { createEditingProject } from '../../../core/editing/project'
import { editedDurationSeconds, editedTimeToSource } from '../../../core/editing/timeline-math'
import { deleteVideoClipAtEdited, splitVideoClipAtEdited, trimVideoClipLeftAtEdited, trimVideoClipRightAtEdited } from '../../../core/editing/timeline-operations'
import type { ClipExportMode } from '../../../shared/clip-export'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { applyEditingTimelineChange, captureEditingAudio, clampEditingTime, createEditingSource, restoreEditingAudio, seekEditingTime } from './editing-action-helpers'
import { exportEditingTimeline as runEditingTimelineExport } from './editing-export-action'
import { loadEditingProject, saveEditingProject } from './editing-project-storage'
import { useEditingCaptionEffect } from './use-editing-caption-effect'
import { useEditingPlaybackEffect } from './use-editing-playback-effect'
import { createEditingProjectFileActions } from './editing-project-file-actions'
import { createEditingClipActions } from './editing-clip-actions'
import { createEditingCaptionActions } from './editing-caption-actions'
import { createEditingAudioActions } from './editing-audio-actions'
import { createEditingSourceActions } from './editing-source-actions'
import { createEditingScriptActions } from './editing-script-actions'
import { createEditingGraphicActions } from './editing-graphic-actions'
import { createEditingVideoBlockActions } from './editing-video-block-actions'
import { createEditingSceneActions } from './editing-scene-actions'
import { createEditingSilenceActions } from './editing-silence-actions'
import { useEditingSourceEffect } from '../use-editing-source-effect'
export function useEditingActions(model: AppModel, derived: AppDerived, selectFile: (file: NonNullable<AppModel['state']['currentFile']>) => void) {
  const openEditingMode = (): void => {
    const durationSeconds = Math.max(0, derived.mediaDurationSeconds ?? model.state.duration)
    const source = createEditingSource(model, durationSeconds)
    if (!source) return
    const restoredProject = loadEditingProject(source)
    const project = restoredProject ?? createEditingProject(source)
    captureEditingAudio(model); model.videoRef.current?.pause()
    const sourceTime = clampEditingTime(model.state.currentTime, durationSeconds)
    model.setEditingProject(project); model.setEditingPast([]); model.setEditingFuture([]); model.setEditingCurrentTime(sourceTime)
    model.setEditingSelectedClipId(null); model.setEditingSelectedCaptionId(null); model.setEditingSelectedGraphicId(null); model.setEditingSelectedVideoBlockId(null)
    if (model.state.currentFile) model.setEditingSourceFiles({ [source.id]: model.state.currentFile }); model.setEditingPreviewSourceId(source.id)
    model.setIsEditingMode(true)
    model.setEditingProjectFilePath(null)
    model.setEditingProjectStatus({ success: true, message: restoredProject ? derived.copy.editing.projectRestored : derived.copy.editing.projectCreated })
    saveEditingProject(project)
  }
  const closeEditingMode = (): void => {
    if (model.editingProject) saveEditingProject(model.editingProject)
    model.videoRef.current?.pause(); restoreEditingAudio(model)
    model.setIsEditingMode(false)
    model.setEditingProject(null); model.setEditingPast([]); model.setEditingFuture([]); model.setEditingCurrentTime(0)
    model.setEditingSelectedClipId(null); model.setEditingSelectedCaptionId(null); model.setEditingSelectedGraphicId(null); model.setEditingSelectedVideoBlockId(null); model.setEditingSourceFiles({}); model.setEditingPreviewSourceId(null)
    model.setEditingProjectFilePath(null)
  }
  const splitEditingClip = (): void => {
    const project = model.editingProject
    if (!project) return
    const result = splitVideoClipAtEdited(project.videoClips, model.editingCurrentTime)
    if (result.clips.some((clip, index) => clip !== project.videoClips[index])) applyEditingTimelineChange(model, result.clips, null)
  }

  const trimEditingClipLeft = (): void => {
    const project = model.editingProject
    if (!project) return
    const result = trimVideoClipLeftAtEdited(project.videoClips, model.editingCurrentTime)
    if (result.removedRange) applyEditingTimelineChange(model, result.clips, result.removedRange)
  }

  const trimEditingClipRight = (): void => {
    const project = model.editingProject
    if (!project) return
    const result = trimVideoClipRightAtEdited(project.videoClips, model.editingCurrentTime)
    if (result.removedRange) applyEditingTimelineChange(model, result.clips, result.removedRange)
  }

  const deleteEditingClip = (): void => {
    const project = model.editingProject
    if (!project) return
    const result = deleteVideoClipAtEdited(project.videoClips, model.editingCurrentTime)
    if (result.removedRange) applyEditingTimelineChange(model, result.clips, result.removedRange)
  }

  const undoEditing = (): void => {
    const project = model.editingProject
    const previous = model.editingPast.at(-1)
    if (!project || !previous) return
    model.setEditingPast((past) => past.slice(0, -1))
    model.setEditingFuture((future) => [project, ...future])
    model.setEditingProject(previous)
    if (model.editingSelectedClipId && !previous.videoClips.some((clip) => clip.id === model.editingSelectedClipId)) model.setEditingSelectedClipId(null); if (model.editingSelectedCaptionId && !previous.captions.some((caption) => caption.id === model.editingSelectedCaptionId)) model.setEditingSelectedCaptionId(null); if (model.editingSelectedGraphicId && !previous.graphics?.some((graphic) => graphic.id === model.editingSelectedGraphicId)) model.setEditingSelectedGraphicId(null); if (model.editingSelectedVideoBlockId && !previous.videoBlocks?.some((block) => block.id === model.editingSelectedVideoBlockId)) model.setEditingSelectedVideoBlockId(null)
    saveEditingProject(previous)
    seekEditingTime(model, model.editingCurrentTime, previous)
  }

  const redoEditing = (): void => {
    const project = model.editingProject
    const next = model.editingFuture[0]
    if (!project || !next) return
    model.setEditingFuture((future) => future.slice(1))
    model.setEditingPast((past) => [...past, project])
    model.setEditingProject(next)
    if (model.editingSelectedClipId && !next.videoClips.some((clip) => clip.id === model.editingSelectedClipId)) model.setEditingSelectedClipId(null); if (model.editingSelectedCaptionId && !next.captions.some((caption) => caption.id === model.editingSelectedCaptionId)) model.setEditingSelectedCaptionId(null); if (model.editingSelectedGraphicId && !next.graphics?.some((graphic) => graphic.id === model.editingSelectedGraphicId)) model.setEditingSelectedGraphicId(null); if (model.editingSelectedVideoBlockId && !next.videoBlocks?.some((block) => block.id === model.editingSelectedVideoBlockId)) model.setEditingSelectedVideoBlockId(null)
    saveEditingProject(next)
    seekEditingTime(model, model.editingCurrentTime, next)
  }

  const toggleEditingPlay = async (): Promise<void> => {
    const video = model.videoRef.current
    const project = model.editingProject
    if (!video || !project) return
    if (!video.paused) {
      video.pause()
      return
    }
    const sourcePoint = editedTimeToSource(project.videoClips, model.editingCurrentTime)
    if (sourcePoint?.clip.sourceId && sourcePoint.clip.sourceId !== model.editingPreviewSourceId) {
      model.editingResumePlaybackRef.current = true
      model.setEditingPreviewSourceId(sourcePoint.clip.sourceId)
      return
    }
    if (sourcePoint && Math.abs(video.currentTime - sourcePoint.sourceSeconds) > 0.05) video.currentTime = sourcePoint.sourceSeconds
    await video.play()
  }

  useEditingPlaybackEffect(model); useEditingCaptionEffect(model, derived); useEditingSourceEffect(model)

  const projectFileActions = createEditingProjectFileActions(model, derived, selectFile); const clipActions = createEditingClipActions(model); const captionActions = createEditingCaptionActions(model); const audioActions = createEditingAudioActions(model); const sourceActions = createEditingSourceActions(model, derived); const scriptActions = createEditingScriptActions(model); const graphicActions = createEditingGraphicActions(model); const videoBlockActions = createEditingVideoBlockActions(model); const sceneActions = createEditingSceneActions(model); const silenceActions = createEditingSilenceActions(model)

  useEffect(() => { if (model.isEditingMode && !model.state.currentFile) closeEditingMode() }, [model.isEditingMode, model.state.currentFile?.path])

  return {
    openEditingMode,
    closeEditingMode,
    seekEditingTime: (seconds: number) => seekEditingTime(model, seconds),
    splitEditingClip,
    trimEditingClipLeft,
    trimEditingClipRight,
    deleteEditingClip,
    undoEditing,
    redoEditing,
    toggleEditingPlay,
    ...clipActions,
    ...captionActions,
    ...scriptActions,
    ...graphicActions,
    ...videoBlockActions,
    ...sceneActions,
    ...silenceActions,
    ...audioActions,
    ...sourceActions,
    ...projectFileActions,
    exportEditingTimeline: (mode?: ClipExportMode, outputVideoPath?: string) => runEditingTimelineExport(model, derived, mode, outputVideoPath)
  }
}
