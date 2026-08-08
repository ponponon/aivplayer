import { useCallback, useEffect, useState } from 'react'
import type { EditingCaption, EditingCaptionSourceRevisions, EditingProject } from '../../../shared/editing-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { createEditingCaptionSources, createEditingCaptionSourceRevisionKey, hasEditingCaptionSourceRevisionChanges, loadEditingCaptionSnapshot } from './editing-caption-loader'
import { saveEditingProject } from './editing-project-storage'
import { mergeEditingScriptSegments } from '../../../core/editing/script-operations'
import { applyEditingSubtitleReloadAddition, applyEditingSubtitleReloadChange, applyEditingSubtitleReloadKeep, applyEditingSubtitleReloadRemoval, buildEditingSubtitleReloadPreview, filterEditingSubtitleReloadPreview, getEditingSubtitleReloadChangeKey, getEditingSubtitleReloadRemovalResolutionKeys, recordEditingSubtitleReloadResolution, replaceEditingCaptionsForReload, type EditingSubtitleReloadChange, type EditingSubtitleReloadPreview } from '../../../core/editing/subtitle-reload'
import { isEditingScriptSegmentCaption } from '../../../core/editing/script-operations'

export type EditingCaptionReloadConflict = {
  sourceRevisionKey: string
  sourceRevisions: EditingCaptionSourceRevisions
  captions: EditingCaption[]
  changes: EditingSubtitleReloadChange[]
  preview: EditingSubtitleReloadPreview
}

function withoutCaptionReloadResolution(project: EditingProject): EditingProject {
  const { captionReloadResolution: _captionReloadResolution, ...next } = project
  return next
}

function acceptCaptionSourceRevisions(project: EditingProject, sourceRevisionKey: string, sourceRevisions: EditingCaptionSourceRevisions, updatedAt = Date.now()): EditingProject {
  return { ...project, captionSourceRevision: sourceRevisionKey, captionSourceRevisions: sourceRevisions, updatedAt }
}

function areCaptionSourceRevisionsEqual(left: EditingCaptionSourceRevisions | undefined, right: EditingCaptionSourceRevisions): boolean {
  return JSON.stringify(left ?? {}) === JSON.stringify(right)
}

function getPendingCaptionReloadPreview(project: EditingProject, sourceRevisionKey: string, preview: EditingSubtitleReloadPreview): EditingSubtitleReloadPreview {
  return project.captionReloadResolution?.sourceRevisionKey === sourceRevisionKey
    ? filterEditingSubtitleReloadPreview(preview, project.captionReloadResolution.changeKeys)
    : preview
}

export function useEditingCaptionEffect(model: AppModel, derived: AppDerived): {
  editingCaptionReloadConflict: EditingCaptionReloadConflict | null
  acceptEditingSubtitleReloadChange: (change: EditingSubtitleReloadChange) => void
  acceptEditingSubtitleReloadAddition: (change: EditingSubtitleReloadChange) => void
  removeEditingSubtitleReloadChange: (change: EditingSubtitleReloadChange) => void
  keepEditingSubtitleReloadRemoval: (change: EditingSubtitleReloadChange) => void
  forceReloadEditingCaptions: () => void
  keepCurrentEditingCaptions: () => void
} {
  const [editingCaptionReloadConflict, setEditingCaptionReloadConflict] = useState<EditingCaptionReloadConflict | null>(null)
  const sourceKey = model.editingProject?.sources.map((source) => `${source.id}:${source.path}`).join('|') ?? ''
  useEffect(() => {
    const project = model.editingProject
    if (!model.isEditingMode || !project || project.sources.length === 0) {
      setEditingCaptionReloadConflict(null)
      return
    }
    let cancelled = false
    const sources = createEditingCaptionSources(project, { currentMediaPath: model.state.currentFile?.path ?? null, subtitlePath: derived.subtitlePath, subtitleSrtPath: derived.subtitleSrtPath, translatedSubtitlePath: derived.translatedSubtitlePath, translatedSubtitleSrtPath: derived.translatedSubtitleSrtPath })
    void loadEditingCaptionSnapshot(sources).then(({ captions, sourceRevisions }) => {
      if (cancelled) return
      model.setEditingProject((current) => {
        if (!current || current.id !== project.id) return current
        const sourceRevisionKey = createEditingCaptionSourceRevisionKey(current, sourceRevisions)
        const fullPreview = buildEditingSubtitleReloadPreview(current.captions, captions, current.scriptSegments)
        const preview = getPendingCaptionReloadPreview(current, sourceRevisionKey, fullPreview)
        const hasAcceptedRevision = (typeof current.captionSourceRevision === 'string' && current.captionSourceRevision.length > 0) || current.captionSourceRevisions !== undefined
        if (hasAcceptedRevision && current.captionSourceRevision !== sourceRevisionKey && hasEditingCaptionSourceRevisionChanges(current.captionSourceRevisions, sourceRevisions) && preview.hasChanges) {
          setEditingCaptionReloadConflict({ sourceRevisionKey, sourceRevisions, captions, changes: fullPreview.changes, preview })
          return current
        }
        setEditingCaptionReloadConflict((conflict) => conflict?.sourceRevisionKey === sourceRevisionKey ? null : conflict)
        const scriptSegments = mergeEditingScriptSegments(current.scriptSegments, captions)
        const deletedSegments = scriptSegments.filter((segment) => segment.deleted)
        const isDeletedCaption = (caption: typeof captions[number]): boolean => {
          if (!caption.sourceId || caption.sourceStartSeconds === undefined || caption.sourceEndSeconds === undefined) return false
          return deletedSegments.some((segment) => isEditingScriptSegmentCaption(caption, segment))
        }
        const existingIds = new Set(current.captions.map((caption) => caption.id))
        const hasExistingCaption = (caption: typeof captions[number]): boolean => {
          if (existingIds.has(caption.id)) return true
          const segment = scriptSegments.find((candidate) => isEditingScriptSegmentCaption(caption, candidate))
          return segment ? current.captions.some((existing) => isEditingScriptSegmentCaption(existing, segment)) : false
        }
        const additions = captions.filter((caption) => !hasExistingCaption(caption) && !isDeletedCaption(caption))
        const loadedById = new Map(captions.map((caption) => [caption.id, caption]))
        const enrichedExisting = current.captions.map((caption) => {
          const loaded = loadedById.get(caption.id)
          return loaded?.words && loaded.words.length > 0 && (!caption.words || caption.words.length === 0)
            ? { ...caption, words: loaded.words }
            : caption
        })
        const captionsChanged = enrichedExisting.some((caption, index) => caption !== current.captions[index])
        const previousSegments = current.scriptSegments ?? []
        const scriptChanged = previousSegments.length !== scriptSegments.length || scriptSegments.some((segment, index) => {
          const previous = previousSegments[index]
          return !previous || JSON.stringify(previous) !== JSON.stringify(segment)
        })
        const revisionsChanged = !areCaptionSourceRevisionsEqual(current.captionSourceRevisions, sourceRevisions)
        if (additions.length === 0 && !scriptChanged && !captionsChanged && !revisionsChanged && current.captionSourceRevision === sourceRevisionKey) return current
        const next = acceptCaptionSourceRevisions({ ...current, captions: [...enrichedExisting, ...additions].sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind)), scriptSegments }, sourceRevisionKey, sourceRevisions)
        saveEditingProject(next)
        return next
      })
    })
    return () => { cancelled = true }
  }, [model.isEditingMode, model.editingProject?.id, model.editingProject?.captionSourceRevision, model.editingProject?.captionSourceRevisions, model.editingProject?.captionReloadResolution?.sourceRevisionKey, model.editingProject?.captionReloadResolution?.changeKeys.join('|'), model.state.currentFile?.path, sourceKey, derived.subtitlePath, derived.subtitleSrtPath, derived.subtitleRevision, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath, derived.translatedSubtitleRevision])

  const forceReloadEditingCaptions = useCallback((): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const next = { ...replaceEditingCaptionsForReload(project, conflict.captions, conflict.sourceRevisionKey), captionSourceRevisions: conflict.sourceRevisions }
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(next)
    model.setEditingSelectedCaptionId(null)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingFuture, model.setEditingPast, model.setEditingProject, model.setEditingSelectedCaptionId])

  const acceptEditingSubtitleReloadChange = useCallback((change: EditingSubtitleReloadChange): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const replaced = applyEditingSubtitleReloadChange(project, conflict.captions, change)
    if (!replaced) return
    const resolved = recordEditingSubtitleReloadResolution(replaced, conflict.sourceRevisionKey, [getEditingSubtitleReloadChangeKey(change)])
    const remainingPreview = getPendingCaptionReloadPreview(resolved, conflict.sourceRevisionKey, conflict.preview)
    const next = remainingPreview.hasChanges
      ? resolved
      : acceptCaptionSourceRevisions(withoutCaptionReloadResolution(resolved), conflict.sourceRevisionKey, conflict.sourceRevisions)
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(next)
    model.setEditingSelectedCaptionId(change.id)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(remainingPreview.hasChanges ? { ...conflict, preview: remainingPreview } : null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingFuture, model.setEditingPast, model.setEditingProject, model.setEditingSelectedCaptionId])

  const acceptEditingSubtitleReloadAddition = useCallback((change: EditingSubtitleReloadChange): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const added = applyEditingSubtitleReloadAddition(project, conflict.captions, change)
    if (!added) return
    const resolved = recordEditingSubtitleReloadResolution(added, conflict.sourceRevisionKey, [getEditingSubtitleReloadChangeKey(change)])
    const remainingPreview = getPendingCaptionReloadPreview(resolved, conflict.sourceRevisionKey, conflict.preview)
    const next = remainingPreview.hasChanges
      ? resolved
      : acceptCaptionSourceRevisions(withoutCaptionReloadResolution(resolved), conflict.sourceRevisionKey, conflict.sourceRevisions)
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(next)
    model.setEditingSelectedCaptionId(change.id)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(remainingPreview.hasChanges ? { ...conflict, preview: remainingPreview } : null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingFuture, model.setEditingPast, model.setEditingProject, model.setEditingSelectedCaptionId])

  const removeEditingSubtitleReloadChange = useCallback((change: EditingSubtitleReloadChange): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const existingResolutionKeys = project.captionReloadResolution?.sourceRevisionKey === conflict.sourceRevisionKey ? project.captionReloadResolution.changeKeys : []
    const removed = applyEditingSubtitleReloadRemoval(project, change, Date.now(), existingResolutionKeys)
    if (!removed) return
    const resolved = recordEditingSubtitleReloadResolution(removed, conflict.sourceRevisionKey, getEditingSubtitleReloadRemovalResolutionKeys(conflict.changes, change))
    const remainingPreview = getPendingCaptionReloadPreview(resolved, conflict.sourceRevisionKey, conflict.preview)
    const next = remainingPreview.hasChanges
      ? resolved
      : acceptCaptionSourceRevisions(withoutCaptionReloadResolution(resolved), conflict.sourceRevisionKey, conflict.sourceRevisions)
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(next)
    model.setEditingSelectedCaptionId(null)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(remainingPreview.hasChanges ? { ...conflict, preview: remainingPreview } : null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingFuture, model.setEditingPast, model.setEditingProject, model.setEditingSelectedCaptionId])

  const keepEditingSubtitleReloadRemoval = useCallback((change: EditingSubtitleReloadChange): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const kept = applyEditingSubtitleReloadKeep(project, conflict.changes, change, conflict.sourceRevisionKey)
    if (!kept) return
    const remainingPreview = getPendingCaptionReloadPreview(kept, conflict.sourceRevisionKey, conflict.preview)
    const next = remainingPreview.hasChanges
      ? kept
      : acceptCaptionSourceRevisions(withoutCaptionReloadResolution(kept), conflict.sourceRevisionKey, conflict.sourceRevisions)
    model.setEditingPast((past) => [...past, project])
    model.setEditingFuture([])
    model.setEditingProject(next)
    model.setEditingSelectedCaptionId(change.id)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(remainingPreview.hasChanges ? { ...conflict, preview: remainingPreview } : null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingFuture, model.setEditingPast, model.setEditingProject, model.setEditingSelectedCaptionId])

  const keepCurrentEditingCaptions = useCallback((): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const next = acceptCaptionSourceRevisions(withoutCaptionReloadResolution(project), conflict.sourceRevisionKey, conflict.sourceRevisions)
    model.setEditingProject(next)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingProject])

  return { editingCaptionReloadConflict, acceptEditingSubtitleReloadChange, acceptEditingSubtitleReloadAddition, removeEditingSubtitleReloadChange, keepEditingSubtitleReloadRemoval, forceReloadEditingCaptions, keepCurrentEditingCaptions }
}
