import { useCallback, useEffect, useState } from 'react'
import type { EditingCaption, EditingProject } from '../../../shared/editing-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { createEditingCaptionPathCandidates, loadEditingCaptions } from './editing-caption-loader'
import { saveEditingProject } from './editing-project-storage'
import { mergeEditingScriptSegments } from '../../../core/editing/script-operations'
import { applyEditingSubtitleReloadAddition, applyEditingSubtitleReloadChange, applyEditingSubtitleReloadKeep, applyEditingSubtitleReloadRemoval, buildEditingSubtitleReloadPreview, filterEditingSubtitleReloadPreview, replaceEditingCaptionsForReload, type EditingSubtitleReloadChange, type EditingSubtitleReloadPreview } from '../../../core/editing/subtitle-reload'

export type EditingCaptionReloadConflict = {
  sourceRevisionKey: string
  captions: EditingCaption[]
  preview: EditingSubtitleReloadPreview
}

function withoutCaptionReloadResolution(project: EditingProject): EditingProject {
  const { captionReloadResolution: _captionReloadResolution, ...next } = project
  return next
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
  const sourceRevisionKey = `source=${derived.subtitleRevision ?? 'none'}|translation=${derived.translatedSubtitleRevision ?? 'none'}`
  useEffect(() => {
    const project = model.editingProject
    if (!model.isEditingMode || !project || project.sources.length === 0) {
      setEditingCaptionReloadConflict(null)
      return
    }
    let cancelled = false
    const sources = project.sources.flatMap((source, index) => [
      { path: index === 0 ? (derived.subtitleSrtPath ?? derived.subtitlePath) : null, pathCandidates: createEditingCaptionPathCandidates(source.path, index === 0 ? (derived.subtitleSrtPath ?? derived.subtitlePath) : null, 'source'), sourceId: source.id, kind: 'source' as const },
      { path: index === 0 ? (derived.translatedSubtitleSrtPath ?? derived.translatedSubtitlePath) : null, pathCandidates: createEditingCaptionPathCandidates(source.path, index === 0 ? (derived.translatedSubtitleSrtPath ?? derived.translatedSubtitlePath) : null, 'translation'), sourceId: source.id, kind: 'translation' as const }
    ])
    void loadEditingCaptions(sources).then((captions) => {
      if (cancelled || captions.length === 0) return
      model.setEditingProject((current) => {
        if (!current || current.id !== project.id) return current
        const preview = getPendingCaptionReloadPreview(current, sourceRevisionKey, buildEditingSubtitleReloadPreview(current.captions, captions))
        const hasAcceptedRevision = typeof current.captionSourceRevision === 'string' && current.captionSourceRevision.length > 0
        if (hasAcceptedRevision && current.captionSourceRevision !== sourceRevisionKey && preview.hasChanges) {
          setEditingCaptionReloadConflict({ sourceRevisionKey, captions, preview })
          return current
        }
        setEditingCaptionReloadConflict((conflict) => conflict?.sourceRevisionKey === sourceRevisionKey ? null : conflict)
        const scriptSegments = mergeEditingScriptSegments(current.scriptSegments, captions)
        const deletedSegments = scriptSegments.filter((segment) => segment.deleted)
        const isDeletedCaption = (caption: typeof captions[number]): boolean => {
          if (caption.kind === 'source') return deletedSegments.some((segment) => segment.id === caption.id)
          if (!caption.sourceId || caption.sourceStartSeconds === undefined || caption.sourceEndSeconds === undefined) return false
          return deletedSegments.some((segment) => {
            if (segment.sourceId !== caption.sourceId) return false
            return Math.min(segment.sourceEndSeconds, caption.sourceEndSeconds!) - Math.max(segment.sourceStartSeconds, caption.sourceStartSeconds!) > 0.05
          })
        }
        const existingIds = new Set(current.captions.map((caption) => caption.id))
        const additions = captions.filter((caption) => !existingIds.has(caption.id) && !isDeletedCaption(caption))
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
        if (additions.length === 0 && !scriptChanged && !captionsChanged && current.captionSourceRevision === sourceRevisionKey) return current
        const next = { ...current, captions: [...enrichedExisting, ...additions].sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind)), scriptSegments, captionSourceRevision: sourceRevisionKey, updatedAt: Date.now() }
        saveEditingProject(next)
        return next
      })
    })
    return () => { cancelled = true }
  }, [model.isEditingMode, model.editingProject?.id, model.editingProject?.captionSourceRevision, model.editingProject?.captionReloadResolution?.sourceRevisionKey, model.editingProject?.captionReloadResolution?.changeKeys.join('|'), sourceKey, sourceRevisionKey, derived.subtitlePath, derived.subtitleSrtPath, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath])

  const forceReloadEditingCaptions = useCallback((): void => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    if (!project || !conflict) return
    const next = replaceEditingCaptionsForReload(project, conflict.captions, conflict.sourceRevisionKey)
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
    const remainingPreview = getPendingCaptionReloadPreview(replaced, conflict.sourceRevisionKey, buildEditingSubtitleReloadPreview(replaced.captions, conflict.captions))
    const next = remainingPreview.hasChanges
      ? replaced
      : { ...withoutCaptionReloadResolution(replaced), captionSourceRevision: conflict.sourceRevisionKey, updatedAt: Date.now() }
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
    const remainingPreview = getPendingCaptionReloadPreview(added, conflict.sourceRevisionKey, buildEditingSubtitleReloadPreview(added.captions, conflict.captions))
    const next = remainingPreview.hasChanges
      ? added
      : { ...withoutCaptionReloadResolution(added), captionSourceRevision: conflict.sourceRevisionKey, updatedAt: Date.now() }
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
    const removed = applyEditingSubtitleReloadRemoval(project, change)
    if (!removed) return
    const remainingPreview = getPendingCaptionReloadPreview(removed, conflict.sourceRevisionKey, buildEditingSubtitleReloadPreview(removed.captions, conflict.captions))
    const next = remainingPreview.hasChanges
      ? removed
      : { ...withoutCaptionReloadResolution(removed), captionSourceRevision: conflict.sourceRevisionKey, updatedAt: Date.now() }
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
    const kept = applyEditingSubtitleReloadKeep(project, conflict.preview.changes, change, conflict.sourceRevisionKey)
    if (!kept) return
    const remainingPreview = getPendingCaptionReloadPreview(kept, conflict.sourceRevisionKey, buildEditingSubtitleReloadPreview(kept.captions, conflict.captions))
    const next = remainingPreview.hasChanges
      ? kept
      : { ...withoutCaptionReloadResolution(kept), captionSourceRevision: conflict.sourceRevisionKey, updatedAt: Date.now() }
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
    const next = { ...withoutCaptionReloadResolution(project), captionSourceRevision: conflict.sourceRevisionKey, updatedAt: Date.now() }
    model.setEditingProject(next)
    saveEditingProject(next)
    setEditingCaptionReloadConflict(null)
  }, [editingCaptionReloadConflict, model.editingProject, model.setEditingProject])

  return { editingCaptionReloadConflict, acceptEditingSubtitleReloadChange, acceptEditingSubtitleReloadAddition, removeEditingSubtitleReloadChange, keepEditingSubtitleReloadRemoval, forceReloadEditingCaptions, keepCurrentEditingCaptions }
}
