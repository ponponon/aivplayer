import { useEffect } from 'react'
import { createEditingProject } from '../../../core/editing/project'
import { getEditingProjectRevision } from '../../../core/editing/edit-proposal'
import { createEditingProjectFromVisionSearchResults, createEditingProjectFromVisionSelections, type VisionSourceMetadata } from '../../../core/ai/vision-evidence'
import { editedDurationSeconds, editedTimeToSource } from '../../../core/editing/timeline-math'
import { deleteVideoClipAtEdited, splitVideoClipAtEdited, trimVideoClipLeftAtEdited, trimVideoClipRightAtEdited } from '../../../core/editing/timeline-operations'
import type { TimelineExportMode } from '../../../shared/clip-export'
import type { VisionClipCollection, VisionSearchResult } from '../../../shared/vision-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { applyEditingTimelineChange, captureEditingAudio, clampEditingTime, createEditingSource, restoreEditingAudio, seekEditingTime } from './editing-action-helpers'
import { exportEditingTimeline as runEditingTimelineExport } from './editing-export-action'
import { loadEditingProject, saveEditingProject } from './editing-project-storage'
import { useEditingCaptionEffect } from './use-editing-caption-effect'
import { useEditingPlaybackEffect } from './use-editing-playback-effect'
import { createEditingProjectFileActions, setEditingProject } from './editing-project-file-actions'
import { createEditingClipActions } from './editing-clip-actions'
import { createEditingCaptionActions } from './editing-caption-actions'
import { createEditingAudioActions } from './editing-audio-actions'
import { createEditingSourceActions } from './editing-source-actions'
import { createEditingScriptActions } from './editing-script-actions'
import { createEditingGraphicActions } from './editing-graphic-actions'
import { createEditingVideoBlockActions } from './editing-video-block-actions'
import { createEditingSceneActions } from './editing-scene-actions'
import { createEditingSilenceActions } from './editing-silence-actions'
import { deleteEditingSelection, duplicateEditingSelection, moveEditingSelection, reorderEditingOverlayTracks } from './editing-selection-actions'
import { useEditingSourceEffect } from '../use-editing-source-effect'
import { isMediaPlaying, syncPlayerPlayingState } from './playback-state'
export function useEditingActions(model: AppModel, derived: AppDerived, selectFile: (file: NonNullable<AppModel['state']['currentFile']>) => void) {
  const openEditingMode = (): void => {
    const durationSeconds = Math.max(0, derived.mediaDurationSeconds ?? model.state.duration)
    const source = createEditingSource(model, durationSeconds)
    if (!source) return
    const restoredProject = loadEditingProject(source)
    const project = restoredProject ?? createEditingProject(source)
    captureEditingAudio(model); const video = model.videoRef.current; video?.pause(); syncPlayerPlayingState(model.setState, video, model.videoRef.current)
    const sourceTime = clampEditingTime(model.state.currentTime, durationSeconds)
    model.setEditingProject(project); model.setEditingPast([]); model.setEditingFuture([]); model.setEditingCurrentTime(sourceTime); model.setEditingClipPreview(null)
    model.setEditingSelectedClipId(null); model.setEditingSelectedCaptionId(null); model.setEditingSelectedGraphicId(null); model.setEditingSelectedVideoBlockId(null)
    if (model.state.currentFile) model.setEditingSourceFiles({ [source.id]: model.state.currentFile }); model.setEditingPreviewSourceId(source.id)
    model.setIsEditingMode(true)
    model.setEditingProjectFilePath(null)
    model.setEditingProjectStatus({ success: true, message: restoredProject ? derived.copy.editing.projectRestored : derived.copy.editing.projectCreated })
    saveEditingProject(project)
  }
  const closeEditingMode = (): void => {
    if (model.editingProject) saveEditingProject(model.editingProject)
    const video = model.videoRef.current; video?.pause(); syncPlayerPlayingState(model.setState, video, model.videoRef.current); restoreEditingAudio(model)
    model.setIsEditingMode(false)
    model.setEditingProject(null); model.setEditingPast([]); model.setEditingFuture([]); model.setEditingCurrentTime(0); model.setEditingClipPreview(null)
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

  const installVisionProject = async (uniquePaths: readonly string[], createProject: (sourceMetadata: ReadonlyMap<string, VisionSourceMetadata>, usablePaths: ReadonlySet<string>) => import('../../../shared/editing-types').EditingProject): Promise<void> => {
    if (uniquePaths.length === 0) return
    model.setEditingProjectStatus({ success: true, message: derived.copy.vision.creatingProject })
    try {
      const entries = await Promise.all(uniquePaths.map(async (path) => {
        const [file, metadata] = await Promise.all([window.aiv.createMediaFile(path), window.aiv.getMediaMetadata(path)])
        const durationSeconds = metadata?.durationSeconds && metadata.durationSeconds > 0 ? metadata.durationSeconds : 0
        return {
          path,
          file,
          durationSeconds,
          metadata
        }
      }))
      const usableEntries = entries.filter((entry) => entry.file && entry.durationSeconds > 0)
      if (usableEntries.length === 0) throw new Error(derived.copy.editing.projectSourceMissing)
      const usablePaths = new Set(usableEntries.map((entry) => entry.path))
      const sourceMetadata = new Map(usableEntries.map((entry) => [entry.path, {
        id: `source-${entry.file.id}`,
        fingerprint: `${entry.file.path}:${entry.durationSeconds}`,
        durationSeconds: entry.durationSeconds,
        width: entry.metadata?.video?.width ?? undefined,
        height: entry.metadata?.video?.height ?? undefined
      }]))
      const project = createProject(sourceMetadata, usablePaths)
      const sourceFiles = Object.fromEntries(usableEntries.map((entry) => [`source-${entry.file.id}`, entry.file])) as Record<string, NonNullable<AppModel['state']['currentFile']>>
      const firstSource = project.sources[0]
      const firstFile = firstSource ? sourceFiles[firstSource.id] : undefined
      if (!firstSource || !firstFile) throw new Error(derived.copy.editing.projectSourceMissing)
      if (model.state.currentFile?.path !== firstFile.path) selectFile(firstFile)
      model.setEditingSourceFiles(sourceFiles)
      model.setEditingPreviewSourceId(firstSource.id)
      model.setEditingProjectFilePath(null)
      setEditingProject(model, project, 0)
      model.setEditingProjectStatus({ success: true, message: derived.copy.vision.projectCreated(project.title) })
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${derived.copy.editing.projectOpenFailed}：${error instanceof Error ? error.message : String(error)}` })
    }
  }

  const createEditingProjectFromVisionResults = async (results: readonly VisionSearchResult[]): Promise<void> => {
    const uniquePaths = [...new Set(results.map((result) => result.videoPath).filter((path) => path.trim().length > 0))]
    await installVisionProject(uniquePaths, (sourceMetadata, usablePaths) => createEditingProjectFromVisionSearchResults(
      results.filter((result) => usablePaths.has(result.videoPath)),
      { sourceMetadata }
    ))
  }

  const createEditingProjectFromVisionCollection = async (collection: VisionClipCollection): Promise<void> => {
    const uniquePaths = [...new Set(collection.selections.map((selection) => selection.videoPath).filter((path) => path.trim().length > 0))]
    await installVisionProject(uniquePaths, (sourceMetadata, usablePaths) => createEditingProjectFromVisionSelections(
      collection.selections.filter((selection) => usablePaths.has(selection.videoPath)),
      { sourceMetadata, title: collection.title }
    ))
  }
  const undoEditing = (): void => {
    const project = model.editingProject
    const previous = model.editingPast.at(-1)
    if (!project || !previous) return
    model.setEditingClipPreview(null)
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
    model.setEditingClipPreview(null)
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
    if (isMediaPlaying(video)) {
      video.pause()
      syncPlayerPlayingState(model.setState, video, model.videoRef.current)
      return
    }
    const sourcePoint = editedTimeToSource(project.videoClips, model.editingCurrentTime)
    if (sourcePoint?.clip.sourceId && sourcePoint.clip.sourceId !== model.editingPreviewSourceId) {
      model.editingResumePlaybackRef.current = true
      model.setEditingPreviewSourceId(sourcePoint.clip.sourceId)
      return
    }
    if (sourcePoint && Math.abs(video.currentTime - sourcePoint.sourceSeconds) > 0.05) video.currentTime = sourcePoint.sourceSeconds
    try { await video.play() } catch { /* The media event will report the final paused state. */ }
    syncPlayerPlayingState(model.setState, video, model.videoRef.current)
  }

  useEditingPlaybackEffect(model); const captionEffect = useEditingCaptionEffect(model, derived); useEditingSourceEffect(model)

  const projectFileActions = createEditingProjectFileActions(model, derived, selectFile); const clipActions = createEditingClipActions(model); const captionActions = createEditingCaptionActions(model); const audioActions = createEditingAudioActions(model); const sourceActions = createEditingSourceActions(model, derived); const scriptActions = createEditingScriptActions(model); const graphicActions = createEditingGraphicActions(model); const videoBlockActions = createEditingVideoBlockActions(model); const sceneActions = createEditingSceneActions(model); const silenceActions = createEditingSilenceActions(model)

  const resolveEditingAgentProposal = async (accepted: boolean): Promise<void> => {
    const pending = model.editingAgentProposal
    if (!pending) return
    model.setEditingAgentProposal(null)
    if (!accepted) {
      await window.aiv.respondEditingAgentProposal(pending.requestId, { outcome: 'rejected', message: '用户取消了 Agent Proposal' })
      return
    }
    const result = scriptActions.applyEditingScriptProposal(pending.proposal)
    await window.aiv.respondEditingAgentProposal(pending.requestId, result.success
      ? { outcome: 'applied' }
      : { outcome: 'stale', message: result.message || 'Proposal 应用失败' })
  }

  useEffect(() => {
    return window.aiv.onEditingAgentProposal((request) => {
      const project = model.editingProject
      if (!model.isEditingMode || !project || model.editingProjectFilePath !== request.projectPath) {
        void window.aiv.respondEditingAgentProposal(request.requestId, { outcome: 'rejected', message: '桌面端当前没有打开匹配的 .aivproj 工程' })
        return
      }
      if (model.editingAgentProposal) {
        void window.aiv.respondEditingAgentProposal(request.requestId, { outcome: 'rejected', message: '已有一个 Agent Proposal 等待确认' })
        return
      }
      if (project.id !== request.proposal.base.projectId || getEditingProjectRevision(project) !== request.proposal.base.revision) {
        void window.aiv.respondEditingAgentProposal(request.requestId, { outcome: 'stale', message: '当前工程快照已变化，请让 Agent 重新生成 Proposal' })
        return
      }
      model.setEditingAgentProposal(request)
    })
  }, [model.editingAgentProposal, model.editingProject, model.editingProjectFilePath, model.isEditingMode])

  useEffect(() => {
    const pending = model.editingAgentProposal
    if (!pending) return
    const project = model.editingProject
    const projectMatches = model.isEditingMode && project && model.editingProjectFilePath === pending.projectPath && project.id === pending.proposal.base.projectId && getEditingProjectRevision(project) === pending.proposal.base.revision
    if (projectMatches) return
    model.setEditingAgentProposal(null)
    void window.aiv.respondEditingAgentProposal(pending.requestId, {
      outcome: project ? 'stale' : 'cancelled',
      message: project ? '确认期间工程已变化，请让 Agent 重新生成 Proposal' : '桌面编辑器已关闭，未应用 Agent Proposal'
    })
  }, [model.editingAgentProposal, model.editingProject, model.editingProjectFilePath, model.isEditingMode])

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
    ...captionEffect,
    ...projectFileActions,
    deleteEditingSelection: (selection: import('../../../core/editing/selection').EditingSelection) => deleteEditingSelection(model, selection),
    duplicateEditingSelection: (selection: import('../../../core/editing/selection').EditingSelection) => duplicateEditingSelection(model, selection),
    moveEditingSelection: (selection: import('../../../core/editing/selection').EditingSelection, deltaSeconds: number) => moveEditingSelection(model, selection, deltaSeconds),
    reorderEditingOverlayTracks: (source: import('../../../shared/editing-types').EditingOverlayTrackKind, target: import('../../../shared/editing-types').EditingOverlayTrackKind) => reorderEditingOverlayTracks(model, source, target),
    exportEditingTimeline: (mode?: TimelineExportMode, outputVideoPath?: string) => runEditingTimelineExport(model, derived, mode, outputVideoPath)
    , createEditingProjectFromVisionResults, createEditingProjectFromVisionCollection
    , resolveEditingAgentProposal
  }
}
