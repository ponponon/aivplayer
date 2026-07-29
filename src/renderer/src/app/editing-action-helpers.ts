import type { EditingCaption, EditingProject, EditingSource } from '../../../shared/editing-types'
import { editedDurationSeconds, editedTimeToSource, sourceRangeToEditedRanges, sourceTimeToEdited } from '../../../core/editing/timeline-math'
import { createEditingProject } from '../../../core/editing/project'
import type { AppModel } from './app-types'
import { saveEditingProject } from './editing-project-storage'

const EDITING_TIME_EPSILON_SECONDS = 0.001

export function clampEditingTime(seconds: number, durationSeconds: number): number {
  return Math.min(Math.max(Number.isFinite(seconds) ? seconds : 0, 0), Math.max(0, durationSeconds))
}

export function captureEditingAudio(model: AppModel): void {
  const video = model.videoRef.current
  model.editingBaseAudioRef.current = { volume: video?.volume ?? model.state.volume, muted: video?.muted ?? model.state.muted }
}

export function restoreEditingAudio(model: AppModel): void {
  const video = model.videoRef.current
  const baseAudio = model.editingBaseAudioRef.current
  if (video && baseAudio) { video.volume = baseAudio.volume; video.muted = baseAudio.muted; model.setState((current) => ({ ...current, volume: baseAudio.volume, muted: baseAudio.muted })) }
  model.editingBaseAudioRef.current = null
}

export function createEditingSource(model: AppModel, durationSeconds: number): EditingSource | null {
  const file = model.state.currentFile
  if (!file) return null
  return {
    id: `source-${file.id}`,
    path: file.path,
    name: file.name,
    fingerprint: `${file.path}:${durationSeconds}`,
    durationSeconds,
    width: model.state.videoWidth || undefined,
    height: model.state.videoHeight || undefined
  }
}

export function seekEditingTime(model: AppModel, seconds: number, project = model.editingProject): void {
  if (!project) return
  const durationSeconds = editedDurationSeconds(project.videoClips)
  const nextTime = clampEditingTime(seconds, durationSeconds)
  const sourcePoint = editedTimeToSource(project.videoClips, nextTime)
  const sourceTime = sourcePoint?.sourceSeconds ?? 0
  const targetSourceId = sourcePoint?.clip.sourceId ?? project.sources[0]?.id ?? null
  const sourceIsAlreadyLoaded = targetSourceId === model.editingPreviewSourceId
  if (targetSourceId && !sourceIsAlreadyLoaded) {
    model.editingResumePlaybackRef.current = Boolean(model.videoRef.current && !model.videoRef.current.paused)
    model.setEditingPreviewSourceId(targetSourceId)
  }
  const video = model.videoRef.current
  if (video && sourceIsAlreadyLoaded) {
    model.playbackEndedRef.current = false
    video.currentTime = sourceTime
  }
  model.setEditingCurrentTime(nextTime)
  model.setState((current) => ({ ...current, currentTime: sourceTime }))
}

export function createProjectForCurrentFile(model: AppModel, durationSeconds: number): EditingProject | null {
  const source = createEditingSource(model, durationSeconds)
  return source ? createEditingProject(source) : null
}

export function withUpdatedTimeline(project: EditingProject, clips: EditingProject['videoClips'], removedRange: { startSeconds: number; endSeconds: number } | null): EditingProject {
  return {
    ...project,
    updatedAt: Date.now(),
    videoClips: clips,
    captions: removedRange
      ? project.captions.flatMap((caption) => {
          const captionStart = caption.startSeconds
          const captionEnd = caption.startSeconds + caption.durationSeconds
          const overlapStart = Math.max(captionStart, removedRange.startSeconds)
          const overlapEnd = Math.min(captionEnd, removedRange.endSeconds)
          const overlap = overlapEnd - overlapStart
          if (overlap <= EDITING_TIME_EPSILON_SECONDS) {
            return captionStart >= removedRange.endSeconds
              ? [{ ...caption, startSeconds: captionStart - (removedRange.endSeconds - removedRange.startSeconds) }]
              : [caption]
          }
          const durationSeconds = caption.durationSeconds - overlap
          return durationSeconds >= 0.1
            ? [{ ...caption, startSeconds: Math.min(captionStart, removedRange.startSeconds), durationSeconds }]
            : []
        })
      : project.captions
  }
}

export function applyEditingTimelineChange(model: AppModel, nextClips: NonNullable<AppModel['editingProject']>['videoClips'], removedRange: { startSeconds: number; endSeconds: number } | null): void {
  const project = model.editingProject
  if (!project || nextClips === project.videoClips) return
  const nextProject = withUpdatedTimeline(project, nextClips, removedRange)
  const nextDurationSeconds = editedDurationSeconds(nextClips)
  model.setEditingPast((past) => [...past, project])
  model.setEditingFuture([])
  model.setEditingProject(nextProject)
  if (model.editingSelectedClipId && !nextClips.some((clip) => clip.id === model.editingSelectedClipId)) model.setEditingSelectedClipId(null)
  if (model.editingSelectedCaptionId && !nextProject.captions.some((caption) => caption.id === model.editingSelectedCaptionId)) model.setEditingSelectedCaptionId(null)
  saveEditingProject(nextProject)
  if (model.editingCurrentTime > nextDurationSeconds) seekEditingTime(model, nextDurationSeconds, nextProject)
}

function remapUnanchoredCaption(caption: EditingCaption, previousClips: EditingProject['videoClips'], nextClips: EditingProject['videoClips']): EditingCaption[] {
  const startPoint = editedTimeToSource(previousClips, caption.startSeconds)
  if (!startPoint) return []
  const endPoint = editedTimeToSource(previousClips, caption.startSeconds + caption.durationSeconds)
  const sourceEndSeconds = endPoint?.sourceSeconds ?? startPoint.sourceSeconds + caption.durationSeconds
  const nextStartSeconds = sourceTimeToEdited(nextClips, startPoint.clip.sourceId, startPoint.sourceSeconds)
  const nextEndSeconds = sourceTimeToEdited(nextClips, startPoint.clip.sourceId, sourceEndSeconds)
  if (nextStartSeconds === null) return []
  return [{ ...caption, startSeconds: nextStartSeconds, durationSeconds: Math.max(0.1, (nextEndSeconds ?? (nextStartSeconds + caption.durationSeconds)) - nextStartSeconds) }]
}

/** Rebuilds caption positions after clip order changes, using source anchors when available. */
export function reorderEditingCaptions(captions: readonly EditingCaption[], previousClips: EditingProject['videoClips'], nextClips: EditingProject['videoClips']): EditingCaption[] {
  return captions.flatMap((caption) => {
    if (caption.sourceId && caption.sourceStartSeconds !== undefined && caption.sourceEndSeconds !== undefined) {
      return sourceRangeToEditedRanges(nextClips, caption.sourceId, caption.sourceStartSeconds, caption.sourceEndSeconds).map((range, index) => ({
        ...caption,
        id: index === 0 ? caption.id : `${caption.id}-${index}`,
        startSeconds: range.startSeconds,
        durationSeconds: range.endSeconds - range.startSeconds
      }))
    }
    return remapUnanchoredCaption(caption, previousClips, nextClips)
  }).sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind))
}
