import { editedDurationSeconds, getVideoClipSpans } from '../../../core/editing/timeline-math'
import { remapEditingCaptionsForReplacement } from '../../../core/editing/caption-operations'
import { insertVideoClipsAtEdited, replaceVideoClipSource } from '../../../core/editing/timeline-operations'
import type { EditingProject, EditingSource, EditingVideoClip } from '../../../shared/editing-types'
import type { MediaFile, MediaProbeMetadata } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { reorderEditingCaptions, seekEditingTime } from './editing-action-helpers'
import { saveEditingProject } from './editing-project-storage'

function createId(prefix: string, index: number): string {
  return `${prefix}-${Date.now().toString(36)}-${index}-${Math.random().toString(36).slice(2, 7)}`
}

function createSource(file: MediaFile, metadata: MediaProbeMetadata | null, existing: EditingSource | undefined): EditingSource | null {
  if (existing) return existing
  const durationSeconds = metadata?.durationSeconds ?? 0
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) return null
  return { id: `source-${file.id}`, path: file.path, name: file.name, fingerprint: `${file.path}:${durationSeconds}`, durationSeconds, width: metadata?.video?.width ?? undefined, height: metadata?.video?.height ?? undefined }
}

function buildNextProject(model: AppModel, sources: EditingSource[], clips: EditingVideoClip[]): EditingProject | null {
  const project = model.editingProject
  if (!project) return null
  return { ...project, updatedAt: Date.now(), sources, videoClips: clips, captions: reorderEditingCaptions(project.captions, project.videoClips, clips) }
}

export function createEditingSourceActions(model: AppModel, derived: AppDerived) {
  const addEditingSources = async (): Promise<void> => {
    const project = model.editingProject
    if (!project || model.isAddingEditingMedia) return
    model.setIsAddingEditingMedia(true)
    model.setEditingProjectStatus({ success: true, message: derived.copy.editing.addingMedia })
    try {
      const files = await window.aiv.openMediaFiles()
      if (files.length === 0) return
      const metadata = await Promise.all(files.map((file) => window.aiv.getMediaMetadata(file.path)))
      const sourceEntries = files.map((file, index) => {
        const existing = project.sources.find((source) => source.path === file.path)
        return { file, source: createSource(file, metadata[index] ?? null, existing) }
      }).filter((entry): entry is { file: MediaFile; source: EditingSource } => entry.source !== null)
      if (sourceEntries.length === 0) {
        model.setEditingProjectStatus({ success: false, message: derived.copy.editing.mediaAddFailed })
        return
      }
      const insertClips = sourceEntries.map((entry, index) => ({ id: createId('clip', index), sourceId: entry.source.id, sourceStartSeconds: 0, sourceEndSeconds: entry.source.durationSeconds }))
      const inserted = insertVideoClipsAtEdited(project.videoClips, insertClips, model.editingCurrentTime)
      const nextProject = buildNextProject(model, [...project.sources, ...sourceEntries.filter((entry) => !project.sources.some((source) => source.id === entry.source.id)).map((entry) => entry.source)], inserted.clips)
      if (!nextProject || inserted.insertedClipIds.length === 0) return
      model.setEditingPast((past) => [...past, project])
      model.setEditingFuture([])
      model.setEditingProject(nextProject)
      model.setEditingSourceFiles((current) => Object.fromEntries([...Object.entries(current), ...sourceEntries.map((entry) => [entry.source.id, entry.file])]))
      saveEditingProject(nextProject)
      const firstInserted = getVideoClipSpans(inserted.clips).find((span) => span.clip.id === inserted.insertedClipIds[0])
      if (firstInserted) {
        model.setEditingSelectedClipId(firstInserted.clip.id)
        seekEditingTime(model, firstInserted.editedStartSeconds + Math.min(0.01, (firstInserted.editedEndSeconds - firstInserted.editedStartSeconds) / 2), nextProject)
      }
      model.setEditingProjectStatus({ success: true, message: derived.copy.editing.mediaAdded(sourceEntries.length) })
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${derived.copy.editing.mediaAddFailed}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      model.setIsAddingEditingMedia(false)
    }
  }

  const insertEditingSourceClips = (sourceIds: readonly string[], editedSeconds = model.editingCurrentTime): void => {
    const project = model.editingProject
    if (!project) return
    const sources = [...new Set(sourceIds)].map((sourceId) => project.sources.find((item) => item.id === sourceId)).filter((source): source is EditingSource => Boolean(source && source.durationSeconds > 0))
    if (sources.length === 0) return
    const insertClips: EditingVideoClip[] = sources.map((source, index) => ({ id: createId('clip', index), sourceId: source.id, sourceStartSeconds: 0, sourceEndSeconds: source.durationSeconds }))
    const inserted = insertVideoClipsAtEdited(project.videoClips, insertClips, editedSeconds)
    if (inserted.insertedClipIds.length === 0) return
    const nextProject = buildNextProject(model, project.sources, inserted.clips)
    if (!nextProject) return
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedClipId(inserted.insertedClipIds[0] ?? null)
    const firstInserted = getVideoClipSpans(inserted.clips).find((span) => span.clip.id === inserted.insertedClipIds[0])
    if (firstInserted) seekEditingTime(model, firstInserted.editedStartSeconds + Math.min(0.01, (firstInserted.editedEndSeconds - firstInserted.editedStartSeconds) / 2), nextProject)
    model.setEditingProjectStatus({ success: true, message: derived.copy.editing.mediaAdded(inserted.insertedClipIds.length) })
    saveEditingProject(nextProject)
  }

  const insertEditingSourceClip = (sourceId: string, editedSeconds = model.editingCurrentTime): void => {
    insertEditingSourceClips([sourceId], editedSeconds)
  }

  const appendEditingSourceClips = (sourceIds: readonly string[]): void => {
    const project = model.editingProject
    if (!project) return
    insertEditingSourceClips(sourceIds, editedDurationSeconds(project.videoClips))
  }

  const replaceEditingClipSource = (sourceId: string, clipId: string): void => {
    const project = model.editingProject
    const source = project?.sources.find((item) => item.id === sourceId)
    const target = project ? getVideoClipSpans(project.videoClips).find((span) => span.clip.id === clipId) : null
    if (!project || !source || !target) return
    const result = replaceVideoClipSource(project.videoClips, clipId, source.id, source.durationSeconds)
    if (!result.replaced) {
      model.setEditingProjectStatus({ success: false, message: derived.copy.editing.assetReplaceTooShort })
      return
    }
    const nextProject = { ...project, updatedAt: Date.now(), videoClips: result.clips, captions: remapEditingCaptionsForReplacement(project.captions, target, source.id) }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(nextProject)
    model.setEditingSelectedClipId(clipId)
    seekEditingTime(model, target.editedStartSeconds + Math.min(0.01, target.editedEndSeconds - target.editedStartSeconds), nextProject)
    model.setEditingProjectStatus({ success: true, message: derived.copy.editing.assetReplaceSuccess(source.name) })
    saveEditingProject(nextProject)
  }

  return { addEditingSources, insertEditingSourceClip, appendEditingSourceClips, replaceEditingClipSource }
}
