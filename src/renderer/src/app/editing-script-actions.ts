import { sourceRangeToEditedRanges } from '../../../core/editing/timeline-math'
import { removeSourceVideoRanges, restoreSourceVideoRange } from '../../../core/editing/timeline-operations'
import { getEditingScriptWordSourceRange, removeEditingScriptWord, removeEditingScriptWords, replaceEditingScriptWord, scriptSegmentCaption, setEditingScriptSegmentDeleted, syncEditingSourceCaptionText, updateEditingScriptSegmentText, updateEditingSourceCaptionText } from '../../../core/editing/script-operations'
import type { EditingCaptionWord, EditingProject, EditingScriptSegment, EditingVideoClip } from '../../../shared/editing-types'
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

function restoreScriptCaptions(project: EditingProject, segment: EditingScriptSegment, clips: EditingVideoClip[]): EditingProject['captions'] {
  const ranges = sourceRangeToEditedRanges(clips, segment.sourceId, segment.sourceStartSeconds, segment.sourceEndSeconds)
  if (ranges.length === 0) return project.captions
  const startSeconds = ranges[0]!.startSeconds
  const endSeconds = ranges[ranges.length - 1]!.endSeconds
  const durationSeconds = Math.max(0.1, endSeconds - startSeconds)
  const existingIds = new Set([segment.id, `translation-${segment.id}`])
  const next = project.captions.filter((caption) => !existingIds.has(caption.id))
  next.push(scriptSegmentCaption(segment, 'source', segment.text, startSeconds, durationSeconds))
  if (segment.translationText) next.push(scriptSegmentCaption(segment, 'translation', segment.translationText, startSeconds, durationSeconds))
  return next.sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind))
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
      captions: timelineProject.captions.filter((caption) => caption.id !== segment.id && caption.id !== `translation-${segment.id}`),
      scriptSegments: setEditingScriptSegmentDeleted(scriptSegmentsOf(project), segmentId, true)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(null)
    saveEditingProject(nextProject)
    seekEditingTime(model, result.removedRanges[0]?.startSeconds ?? model.editingCurrentTime, nextProject)
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
    if (!result.restored) return
    const nextProject = {
      ...project,
      updatedAt: Date.now(),
      videoClips: result.clips,
      captions: restoreScriptCaptions(project, segment, result.clips),
      scriptSegments: setEditingScriptSegmentDeleted(scriptSegmentsOf(project), segmentId, false)
    }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedCaptionId(segment.id)
    saveEditingProject(nextProject)
    const range = sourceRangeToEditedRanges(result.clips, segment.sourceId, segment.sourceStartSeconds, segment.sourceEndSeconds)[0]
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

  return { selectEditingScriptSegment, deleteEditingScriptSegment, restoreEditingScriptSegment, updateEditingScriptText, deleteEditingScriptWord, replaceEditingScriptWord: replaceEditingScriptWordAction, deleteEditingScriptWords }
}
