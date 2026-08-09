import { sourceRangeToEditedRanges } from '../../../core/editing/timeline-math'
import { removeSourceVideoRanges, restoreSourceVideoRange } from '../../../core/editing/timeline-operations'
import { applyEditingProposal, buildDeleteScriptProposal, EditingProposalError } from '../../../core/editing/edit-proposal'
import { getEditingScriptWordSourceRange, isEditingScriptSegmentCaption, removeEditingScriptWord, removeEditingScriptWords, replaceEditingScriptWord, restoreEditingScriptSegmentCaptions, setEditingScriptSegmentDeleted, syncEditingSourceCaptionText, updateEditingScriptSegmentText, updateEditingSourceCaptionText } from '../../../core/editing/script-operations'
import type { EditingCaptionWord, EditingProject, EditingScriptSegment, EditingVideoClip } from '../../../shared/editing-types'
import type { EditingProposal } from '../../../shared/editing-proposal'
import type { AppModel } from './app-types'
import { saveEditingProject } from './editing-project-storage'
import { seekEditingTime, withUpdatedTimelineRanges } from './editing-action-helpers'

function createId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

function scriptSegmentsOf(project: EditingProject): EditingScriptSegment[] {
  return project.scriptSegments ? [...project.scriptSegments] : []
}

function createRightClip(base: EditingVideoClip, sourceStartSeconds: number, sourceEndSeconds: number): EditingVideoClip {
  return { ...base, id: createId('clip'), sourceStartSeconds, sourceEndSeconds }
}

function createRestoredClip(project: EditingProject, sourceId: string, sourceStartSeconds: number, sourceEndSeconds: number): EditingVideoClip {
  const base = project.videoClips.find((clip) => clip.sourceId === sourceId)
  return {
    id: createId('clip-restored'),
    sourceId,
    sourceStartSeconds,
    sourceEndSeconds,
    ...(base?.volume === undefined ? {} : { volume: base.volume }),
    ...(base?.muted === undefined ? {} : { muted: base.muted }),
    ...(base?.treatment === undefined ? {} : { treatment: base.treatment }),
    ...(base?.treatmentScale === undefined ? {} : { treatmentScale: base.treatmentScale }),
    ...(base?.treatmentAnchor === undefined ? {} : { treatmentAnchor: base.treatmentAnchor }),
    ...(base?.treatmentSize === undefined ? {} : { treatmentSize: base.treatmentSize }),
    ...(base?.filter === undefined ? {} : { filter: base.filter }),
    ...(base?.transitionIn === undefined ? {} : { transitionIn: base.transitionIn }),
    ...(base?.enterMotion === undefined ? {} : { enterMotion: base.enterMotion }),
    ...(base?.exitMotion === undefined ? {} : { exitMotion: base.exitMotion }),
    ...(base?.motionDurationSeconds === undefined ? {} : { motionDurationSeconds: base.motionDurationSeconds })
  }
}

export type EditingScriptWordTarget = {
  segmentId: string
  word: EditingCaptionWord
}

export type EditingProposalApplyResult = {
  success: boolean
  message?: string
}

export function createEditingScriptActions(model: AppModel) {
  const selectEditingScriptSegment = (segmentId: string): void => {
    const project = model.editingProject
    const segment = project?.scriptSegments?.find((item) => item.id === segmentId)
    if (!project || !segment) return
    const range = sourceRangeToEditedRanges(project.videoClips, segment.sourceId, segment.sourceStartSeconds, segment.sourceEndSeconds)[0]
    if (range) seekEditingTime(model, range.startSeconds, project)
  }

  const deleteEditingScriptSegment = (segmentId: string): void => {
    const project = model.editingProject
    const segment = project?.scriptSegments?.find((item) => item.id === segmentId)
    if (!project || !segment || segment.deleted) return
    const result = removeSourceVideoRanges(
      project.videoClips,
      segment.sourceId,
      [{ startSeconds: segment.sourceStartSeconds, endSeconds: segment.sourceEndSeconds }],
      createRightClip
    )
    if (result.removedRanges.length === 0) return
    const timelineProject = withUpdatedTimelineRanges(project, result.clips, result.removedRanges)
    const nextProject = {
      ...timelineProject,
      captions: timelineProject.captions.filter((caption) => !isEditingScriptSegmentCaption(caption, segment)),
      scriptSegments: setEditingScriptSegmentDeleted(scriptSegmentsOf(project), segmentId, true)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(null)
    saveEditingProject(nextProject)
    seekEditingTime(model, result.removedRanges[0]?.startSeconds ?? model.editingCurrentTime, nextProject)
  }

  const createDeleteEditingScriptProposal = (segmentIds: readonly string[]): EditingProposal | null => {
    const project = model.editingProject
    if (!project) return null
    try {
      return buildDeleteScriptProposal(project, segmentIds)
    } catch (error) {
      const message = error instanceof EditingProposalError ? error.message : String(error)
      model.setEditingProjectStatus({ success: false, message })
      return null
    }
  }

  const applyEditingScriptProposal = (proposal: EditingProposal): EditingProposalApplyResult => {
    const project = model.editingProject
    if (!project) return { success: false, message: '当前没有打开的剪辑工程' }
    try {
      const nextProject = applyEditingProposal(project, proposal, { updatedAt: Date.now() })
      model.setEditingPast((past) => [...past, project])
      model.setEditingFuture([])
      model.setEditingProject(nextProject)
      model.setEditingSelectedCaptionId(null)
      if (model.editingSelectedClipId && !nextProject.videoClips.some((clip) => clip.id === model.editingSelectedClipId)) model.setEditingSelectedClipId(null)
      if (model.editingSelectedGraphicId && !nextProject.graphics?.some((graphic) => graphic.id === model.editingSelectedGraphicId)) model.setEditingSelectedGraphicId(null)
      if (model.editingSelectedVideoBlockId && !nextProject.videoBlocks?.some((block) => block.id === model.editingSelectedVideoBlockId)) model.setEditingSelectedVideoBlockId(null)
      saveEditingProject(nextProject)
      seekEditingTime(model, proposal.diff.removedEditedRanges[0]?.startSeconds ?? model.editingCurrentTime, nextProject)
      return { success: true }
    } catch (error) {
      const message = error instanceof EditingProposalError ? error.message : String(error)
      model.setEditingProjectStatus({ success: false, message })
      return { success: false, message }
    }
  }

  const restoreEditingScriptSegment = (segmentId: string): void => {
    const project = model.editingProject
    const segment = project?.scriptSegments?.find((item) => item.id === segmentId)
    if (!project || !segment?.deleted) return
    const result = restoreSourceVideoRange(
      project.videoClips,
      segment.sourceId,
      segment.sourceStartSeconds,
      segment.sourceEndSeconds,
      (sourceStartSeconds, sourceEndSeconds) => createRestoredClip(project, segment.sourceId, sourceStartSeconds, sourceEndSeconds)
    )
    const restoredRanges = sourceRangeToEditedRanges(result.clips, segment.sourceId, segment.sourceStartSeconds, segment.sourceEndSeconds)
    if (!result.restored && restoredRanges.length === 0) return
    const nextProject = {
      ...project,
      updatedAt: Date.now(),
      videoClips: result.clips,
      captions: restoreEditingScriptSegmentCaptions(project.captions, segment, result.clips),
      scriptSegments: setEditingScriptSegmentDeleted(scriptSegmentsOf(project), segmentId, false)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(segment.id)
    saveEditingProject(nextProject)
    const range = restoredRanges[0]
    if (range) seekEditingTime(model, range.startSeconds, nextProject)
  }

  const updateEditingScriptText = (segmentId: string, text: string): void => {
    const project = model.editingProject
    const segment = project?.scriptSegments?.find((item) => item.id === segmentId)
    if (!project || !segment || segment.deleted) return
    const nextSegments = updateEditingScriptSegmentText(project.scriptSegments ?? [], segmentId, text)
    if (nextSegments.every((item, index) => item === project.scriptSegments?.[index])) return
    const nextText = nextSegments.find((item) => item.id === segmentId)?.text
    if (!nextText) return
    const nextProject = {
      ...project,
      updatedAt: Date.now(),
      scriptSegments: nextSegments,
      captions: updateEditingSourceCaptionText(project.captions, segmentId, nextText)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(segmentId)
    saveEditingProject(nextProject)
  }

  const deleteEditingScriptWord = (segmentId: string, word: EditingCaptionWord): void => {
    const project = model.editingProject
    const segment = project?.scriptSegments?.find((item) => item.id === segmentId)
    if (!project || !segment || segment.deleted || !segment.words || segment.words.length <= 1) {
      if (segment?.words?.length === 1) deleteEditingScriptSegment(segmentId)
      return
    }
    const wordRange = getEditingScriptWordSourceRange(segment, word)
    if (!wordRange) return
    const result = removeSourceVideoRanges(
      project.videoClips,
      segment.sourceId,
      [{ startSeconds: Math.max(segment.sourceStartSeconds, wordRange.startSeconds - 0.02), endSeconds: Math.min(segment.sourceEndSeconds, wordRange.endSeconds + 0.02) }],
      createRightClip
    )
    if (result.removedRanges.length === 0) return
    const nextSegment = removeEditingScriptWord(segment, word)
    const timelineProject = withUpdatedTimelineRanges(project, result.clips, result.removedRanges)
    const nextText = nextSegment.text
    const nextProject = {
      ...timelineProject,
      captions: syncEditingSourceCaptionText(timelineProject.captions, segmentId, nextText),
      scriptSegments: scriptSegmentsOf(project).map((item) => item.id === segmentId ? nextSegment : item)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(segmentId)
    saveEditingProject(nextProject)
    seekEditingTime(model, result.removedRanges[0]?.startSeconds ?? model.editingCurrentTime, nextProject)
  }

  const replaceEditingScriptWordAction = (segmentId: string, word: EditingCaptionWord, replacementText: string): void => {
    const project = model.editingProject
    const segment = project?.scriptSegments?.find((item) => item.id === segmentId)
    if (!project || !segment || segment.deleted || !segment.words) return
    const nextSegment = replaceEditingScriptWord(segment, word, replacementText)
    if (nextSegment === segment) return
    const nextProject = {
      ...project,
      updatedAt: Date.now(),
      scriptSegments: scriptSegmentsOf(project).map((item) => item.id === segmentId ? nextSegment : item),
      captions: syncEditingSourceCaptionText(project.captions, segmentId, nextSegment.text)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(segmentId)
    saveEditingProject(nextProject)
  }

  const deleteEditingScriptWords = (targets: readonly EditingScriptWordTarget[]): void => {
    const project = model.editingProject
    if (!project || targets.length === 0) return

    const activeSegments = new Map((project.scriptSegments ?? []).filter((segment) => !segment.deleted).map((segment) => [segment.id, segment]))
    const groupedTargets = new Map<string, EditingCaptionWord[]>()
    for (const target of targets) {
      const segment = activeSegments.get(target.segmentId)
      if (!segment?.words?.length) continue
      const current = groupedTargets.get(target.segmentId) ?? []
      if (!current.some((word) => Math.abs(word.startSeconds - target.word.startSeconds) < 0.001 && Math.abs(word.endSeconds - target.word.endSeconds) < 0.001 && word.text === target.word.text)) current.push(target.word)
      groupedTargets.set(target.segmentId, current)
    }
    if (groupedTargets.size === 0) return

    const wholeSegmentIds = new Set<string>()
    const rangesBySource = new Map<string, Array<{ startSeconds: number; endSeconds: number }>>()
    for (const [segmentId, words] of groupedTargets) {
      const segment = activeSegments.get(segmentId)
      if (!segment) continue
      if (words.length >= (segment.words?.length ?? 0)) {
        wholeSegmentIds.add(segmentId)
        const ranges = rangesBySource.get(segment.sourceId) ?? []
        ranges.push({ startSeconds: segment.sourceStartSeconds, endSeconds: segment.sourceEndSeconds })
        rangesBySource.set(segment.sourceId, ranges)
        continue
      }
      for (const word of words) {
        const range = getEditingScriptWordSourceRange(segment, word)
        if (!range) continue
        const ranges = rangesBySource.get(segment.sourceId) ?? []
        ranges.push({ startSeconds: Math.max(segment.sourceStartSeconds, range.startSeconds - 0.02), endSeconds: Math.min(segment.sourceEndSeconds, range.endSeconds + 0.02) })
        rangesBySource.set(segment.sourceId, ranges)
      }
    }

    let timelineProject = project
    let clips = project.videoClips
    let removedAny = false
    for (const [sourceId, ranges] of rangesBySource) {
      const result = removeSourceVideoRanges(clips, sourceId, ranges, createRightClip)
      if (result.removedRanges.length === 0) continue
      timelineProject = withUpdatedTimelineRanges(timelineProject, result.clips, result.removedRanges)
      clips = result.clips
      removedAny = true
    }
    if (!removedAny) return

    let nextSegments = scriptSegmentsOf(project).map((segment) => {
      const words = groupedTargets.get(segment.id)
      if (!words) return segment
      if (wholeSegmentIds.has(segment.id)) return { ...segment, deleted: true }
      return removeEditingScriptWords(segment, words)
    })
    let captions = timelineProject.captions
    for (const segmentId of wholeSegmentIds) captions = captions.filter((caption) => caption.id !== segmentId && caption.id !== `translation-${segmentId}`)
    for (const [segmentId] of groupedTargets) {
      if (wholeSegmentIds.has(segmentId)) continue
      const segment = nextSegments.find((item) => item.id === segmentId)
      if (segment) captions = syncEditingSourceCaptionText(captions, segmentId, segment.text)
    }
    const nextProject = { ...timelineProject, captions, scriptSegments: nextSegments }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(targets[0]?.segmentId ?? null)
    saveEditingProject(nextProject)
    seekEditingTime(model, model.editingCurrentTime, nextProject)
  }

  return { selectEditingScriptSegment, deleteEditingScriptSegment, createDeleteEditingScriptProposal, applyEditingScriptProposal, restoreEditingScriptSegment, updateEditingScriptText, deleteEditingScriptWord, replaceEditingScriptWord: replaceEditingScriptWordAction, deleteEditingScriptWords }
}
