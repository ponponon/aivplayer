import { getVideoClipSpans } from '../../../core/editing/timeline-math'
import { insertVideoClipsAtEdited } from '../../../core/editing/timeline-operations'
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

  return { addEditingSources }
}
