import { useCallback, useEffect, useState } from 'react'
import type { EditingCaption, EditingCaptionSourceRevisions, EditingProject, EditingSource } from '../../../shared/editing-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel, EditingProjectStatus } from './app-types'
import { createEditingCaptionSources, createEditingCaptionSourceRevisionKey, getEditingCaptionCandidateAudits, hasEditingCaptionSourceRevisionChanges, loadEditingCaptionSnapshot, normalizeEditingCaptionPreferredPaths, type EditingCaptionSourcePaths } from './editing-caption-loader'
import { saveEditingProject } from './editing-project-storage'
import { mergeEditingScriptSegments } from '../../../core/editing/script-operations'
import { applyEditingSubtitleReloadAddition, applyEditingSubtitleReloadChange, applyEditingSubtitleReloadKeep, applyEditingSubtitleReloadRemoval, buildEditingSubtitleReloadPreview, filterEditingSubtitleReloadPreview, getEditingSubtitleReloadChangeKey, getEditingSubtitleReloadRemovalResolutionKeys, recordEditingSubtitleReloadResolution, replaceEditingCaptionsForReload, type EditingSubtitleReloadChange, type EditingSubtitleReloadPreview } from '../../../core/editing/subtitle-reload'
import { isEditingScriptSegmentCaption } from '../../../core/editing/script-operations'
import { getEditingSubtitleReloadCopy } from '../../../shared/editing-subtitle-reload-copy'
import { getEditingSubtitleCandidateCopy } from '../../../shared/editing-subtitle-candidate-copy'
import { getEditingCaptionWatchDirectories } from '../../../shared/editing-caption-watcher'

export type EditingCaptionReloadConflict = {
  sourceRevisionKey: string
  sourceRevisions: EditingCaptionSourceRevisions
  sourcePaths: EditingCaptionSourcePaths
  sources: Pick<EditingSource, 'id' | 'name' | 'path'>[]
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

function getEditingCaptionCandidatePathLabel(path: string | null): string {
  if (!path) return '—'
  const normalized = path.replace(/[\\/]+$/u, '') || path
  const separatorIndex = Math.max(normalized.lastIndexOf('/'), normalized.lastIndexOf('\\'))
  return separatorIndex >= 0 ? normalized.slice(separatorIndex + 1) : normalized
}

export function formatEditingCaptionCandidateStatus(project: Pick<EditingProject, 'sources'>, sourcePaths: EditingCaptionSourcePaths, locale: Parameters<typeof getEditingSubtitleReloadCopy>[0]): EditingProjectStatus | null {
  const audits = getEditingCaptionCandidateAudits(sourcePaths)
  if (audits.length === 0) return null
  const reloadCopy = getEditingSubtitleReloadCopy(locale)
  const candidateCopy = getEditingSubtitleCandidateCopy(locale)
  const sourceNames = new Map(project.sources.map((source) => [source.id, source.name]))
  const messages = audits.map((audit) => {
    const sourceName = sourceNames.get(audit.sourceId) ?? reloadCopy.unknownSource
    const kindLabel = audit.kind === 'source' ? reloadCopy.source : reloadCopy.translation
    return candidateCopy.auditSummary(sourceName, kindLabel, audit.validPathCount, audit.validCandidateCount, getEditingCaptionCandidatePathLabel(audit.selectedPath))
  })
  const groups = audits.map((audit) => {
    const sourceName = sourceNames.get(audit.sourceId) ?? reloadCopy.unknownSource
    const kindLabel = audit.kind === 'source' ? reloadCopy.source : reloadCopy.translation
    const items = [
      candidateCopy.auditSelected(sourceName, kindLabel, audit.selectedPath ?? '—'),
      ...audit.equivalentCandidateGroups.map((group) => candidateCopy.auditEquivalent(sourceName, kindLabel, group.join(' · '))),
      ...(audit.validCandidateCount > 1 ? [candidateCopy.auditDistinct(sourceName, kindLabel, audit.validCandidatePaths.join(' · '))] : [])
    ]
    return { id: `${audit.sourceId}-${audit.kind}`, label: `${sourceName} / ${kindLabel}`, items }
  })
  return { success: audits.every((audit) => audit.validCandidateCount <= 1), message: messages.join('；'), origin: 'caption-candidates', details: { label: candidateCopy.detailsLabel, groups } }
}

export function mergeEditingCaptionCandidateStatus(currentStatus: EditingProjectStatus | null, candidateStatus: EditingProjectStatus | null): EditingProjectStatus | null {
  if (candidateStatus) return candidateStatus
  return currentStatus?.origin === 'caption-candidates' ? null : currentStatus
}

export function useEditingCaptionEffect(model: AppModel, derived: AppDerived): {
  editingCaptionReloadConflict: EditingCaptionReloadConflict | null
  isRebuildingEditingCaptionManifest: boolean
  rebuildEditingCaptionManifest: () => Promise<void>
  acceptEditingSubtitleReloadChange: (change: EditingSubtitleReloadChange) => void
  acceptEditingSubtitleReloadAddition: (change: EditingSubtitleReloadChange) => void
  removeEditingSubtitleReloadChange: (change: EditingSubtitleReloadChange) => void
  keepEditingSubtitleReloadRemoval: (change: EditingSubtitleReloadChange) => void
  selectEditingCaptionCandidate: (sourceId: string, kind: EditingCaption['kind'], path: string) => Promise<void>
  clearEditingCaptionCandidate: (sourceId: string, kind: EditingCaption['kind']) => Promise<void>
  isSelectingEditingCaptionCandidate: string | null
  forceReloadEditingCaptions: () => void
  keepCurrentEditingCaptions: () => void
} {
  const [editingCaptionReloadConflict, setEditingCaptionReloadConflict] = useState<EditingCaptionReloadConflict | null>(null)
  const [isRebuildingEditingCaptionManifest, setIsRebuildingEditingCaptionManifest] = useState(false)
  const [isSelectingEditingCaptionCandidate, setIsSelectingEditingCaptionCandidate] = useState<string | null>(null)
  const [captionWatchVersion, setCaptionWatchVersion] = useState(0)
  const sourceKey = model.editingProject
    ? `${model.editingProject.sources.map((source) => `${source.id}:${source.path}`).join('|')}|clips=${model.editingProject.videoClips.map((clip) => clip.sourceId).join('|')}`
    : ''
  const preferredCaptionPathKey = JSON.stringify(model.editingProject?.captionSourcePaths ?? {})

  useEffect(() => {
    const project = model.editingProject
    if (!model.isEditingMode || !project || project.sources.length === 0) return
    let disposed = false
    const sources = createEditingCaptionSources(project, { currentMediaPath: model.state.currentFile?.path ?? null, subtitlePath: derived.subtitlePath, subtitleSrtPath: derived.subtitleSrtPath, translatedSubtitlePath: derived.translatedSubtitlePath, translatedSubtitleSrtPath: derived.translatedSubtitleSrtPath, translationLanguage: derived.quickTargetLanguage, preferredCaptionPaths: project.captionSourcePaths })
    const candidatePaths = sources.flatMap((source) => [source.path, ...(source.pathCandidates ?? [])]).filter((path): path is string => Boolean(path))
    const removeFilesChangedListener = window.aiv.onEditingCaptionFilesChanged(() => {
      if (!disposed) setCaptionWatchVersion((version) => version + 1)
    })
    const directories = getEditingCaptionWatchDirectories(candidatePaths)
    void window.aiv.startEditingCaptionWatcher({ directories, candidatePaths }).catch(() => undefined)
    return () => {
      disposed = true
      removeFilesChangedListener()
      void window.aiv.stopEditingCaptionWatcher().catch(() => undefined)
    }
  }, [derived.quickTargetLanguage, derived.subtitlePath, derived.subtitleSrtPath, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath, model.editingProject?.id, model.isEditingMode, model.state.currentFile?.path, preferredCaptionPathKey, sourceKey])

  useEffect(() => {
    const project = model.editingProject
    if (!model.isEditingMode || !project || project.sources.length === 0) {
      setEditingCaptionReloadConflict(null)
      return
    }
    let cancelled = false
    const sources = createEditingCaptionSources(project, { currentMediaPath: model.state.currentFile?.path ?? null, subtitlePath: derived.subtitlePath, subtitleSrtPath: derived.subtitleSrtPath, translatedSubtitlePath: derived.translatedSubtitlePath, translatedSubtitleSrtPath: derived.translatedSubtitleSrtPath, translationLanguage: derived.quickTargetLanguage, preferredCaptionPaths: project.captionSourcePaths })
    void loadEditingCaptionSnapshot(sources).then(({ captions, sourceRevisions, sourcePaths }) => {
      if (cancelled) return
      const candidateStatus = formatEditingCaptionCandidateStatus(project, sourcePaths, model.appSettings.ui.locale)
      model.setEditingProjectStatus((currentStatus) => mergeEditingCaptionCandidateStatus(currentStatus, candidateStatus))
      model.setEditingProject((current) => {
        if (!current || current.id !== project.id) return current
        const normalizedPreferredPaths = normalizeEditingCaptionPreferredPaths(current.captionSourcePaths, sourcePaths)
        const normalizedCurrent = normalizedPreferredPaths === current.captionSourcePaths ? current : { ...current, captionSourcePaths: normalizedPreferredPaths, updatedAt: Date.now() }
        const sourceRevisionKey = createEditingCaptionSourceRevisionKey(normalizedCurrent, sourceRevisions)
        const fullPreview = buildEditingSubtitleReloadPreview(normalizedCurrent.captions, captions, normalizedCurrent.scriptSegments)
        const preview = getPendingCaptionReloadPreview(normalizedCurrent, sourceRevisionKey, fullPreview)
        const hasAcceptedRevision = (typeof normalizedCurrent.captionSourceRevision === 'string' && normalizedCurrent.captionSourceRevision.length > 0) || normalizedCurrent.captionSourceRevisions !== undefined
        if (hasAcceptedRevision && normalizedCurrent.captionSourceRevision !== sourceRevisionKey && hasEditingCaptionSourceRevisionChanges(normalizedCurrent.captionSourceRevisions, sourceRevisions) && preview.hasChanges) {
          setEditingCaptionReloadConflict({ sourceRevisionKey, sourceRevisions, sourcePaths, sources: normalizedCurrent.sources.map(({ id, name, path }) => ({ id, name, path })), captions, changes: fullPreview.changes, preview })
          if (normalizedCurrent !== current) saveEditingProject(normalizedCurrent)
          return normalizedCurrent
        }
        setEditingCaptionReloadConflict((conflict) => conflict?.sourceRevisionKey === sourceRevisionKey ? null : conflict)
        const scriptSegments = mergeEditingScriptSegments(normalizedCurrent.scriptSegments, captions)
        const deletedSegments = scriptSegments.filter((segment) => segment.deleted)
        const isDeletedCaption = (caption: typeof captions[number]): boolean => {
          if (!caption.sourceId || caption.sourceStartSeconds === undefined || caption.sourceEndSeconds === undefined) return false
          return deletedSegments.some((segment) => isEditingScriptSegmentCaption(caption, segment))
        }
        const existingIds = new Set(normalizedCurrent.captions.map((caption) => caption.id))
        const hasExistingCaption = (caption: typeof captions[number]): boolean => {
          if (existingIds.has(caption.id)) return true
          const segment = scriptSegments.find((candidate) => isEditingScriptSegmentCaption(caption, candidate))
          return segment ? normalizedCurrent.captions.some((existing) => isEditingScriptSegmentCaption(existing, segment)) : false
        }
        const additions = captions.filter((caption) => !hasExistingCaption(caption) && !isDeletedCaption(caption))
        const loadedById = new Map(captions.map((caption) => [caption.id, caption]))
        const enrichedExisting = normalizedCurrent.captions.map((caption) => {
          const loaded = loadedById.get(caption.id)
          return loaded?.words && loaded.words.length > 0 && (!caption.words || caption.words.length === 0)
            ? { ...caption, words: loaded.words }
            : caption
        })
        const captionsChanged = enrichedExisting.some((caption, index) => caption !== normalizedCurrent.captions[index])
        const previousSegments = normalizedCurrent.scriptSegments ?? []
        const scriptChanged = previousSegments.length !== scriptSegments.length || scriptSegments.some((segment, index) => {
          const previous = previousSegments[index]
          return !previous || JSON.stringify(previous) !== JSON.stringify(segment)
        })
        const revisionsChanged = !areCaptionSourceRevisionsEqual(normalizedCurrent.captionSourceRevisions, sourceRevisions)
        if (additions.length === 0 && !scriptChanged && !captionsChanged && !revisionsChanged && normalizedCurrent.captionSourceRevision === sourceRevisionKey) {
          if (normalizedCurrent !== current) saveEditingProject(normalizedCurrent)
          return normalizedCurrent
        }
        const next = acceptCaptionSourceRevisions({ ...normalizedCurrent, captions: [...enrichedExisting, ...additions].sort((left, right) => left.startSeconds - right.startSeconds || left.kind.localeCompare(right.kind)), scriptSegments }, sourceRevisionKey, sourceRevisions)
        saveEditingProject(next)
        return next
      })
    })
    return () => { cancelled = true }
  }, [captionWatchVersion, model.isEditingMode, model.editingProject?.id, model.editingProject?.captionSourceRevision, model.editingProject?.captionSourceRevisions, model.editingProject?.captionReloadResolution?.sourceRevisionKey, model.editingProject?.captionReloadResolution?.changeKeys.join('|'), model.state.currentFile?.path, sourceKey, preferredCaptionPathKey, derived.subtitlePath, derived.subtitleSrtPath, derived.subtitleRevision, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath, derived.translatedSubtitleRevision, derived.quickTargetLanguage, model.appSettings.ui.locale])

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

  const changeEditingCaptionCandidate = useCallback(async (sourceId: string, kind: EditingCaption['kind'], preferredPath: string | null): Promise<void> => {
    const project = model.editingProject
    const conflict = editingCaptionReloadConflict
    const pathInfo = conflict?.sourcePaths[sourceId]?.[kind]
    const selectionKey = `${sourceId}:${kind}:${preferredPath ?? 'automatic'}`
    const currentPreferred = project?.captionSourcePaths?.[sourceId] ?? { source: null, translation: null }
    if (!project || !conflict || !pathInfo || isSelectingEditingCaptionCandidate) return
    if (preferredPath === null ? !currentPreferred[kind] : (!pathInfo.validCandidatePaths.includes(preferredPath) || pathInfo.selectedPath === preferredPath)) return
    setIsSelectingEditingCaptionCandidate(selectionKey)
    try {
      const preferredCaptionPaths = {
        ...project.captionSourcePaths,
        [sourceId]: { ...currentPreferred, [kind]: preferredPath }
      }
      const sources = createEditingCaptionSources(project, { currentMediaPath: model.state.currentFile?.path ?? null, subtitlePath: derived.subtitlePath, subtitleSrtPath: derived.subtitleSrtPath, translatedSubtitlePath: derived.translatedSubtitlePath, translatedSubtitleSrtPath: derived.translatedSubtitleSrtPath, translationLanguage: derived.quickTargetLanguage, preferredCaptionPaths })
      const targetSource = sources.find((source) => source.sourceId === sourceId && source.kind === kind)
      if (!targetSource) throw new Error('字幕来源已不再活动')
      const snapshot = await loadEditingCaptionSnapshot(sources)
      if (preferredPath !== null && snapshot.sourcePaths[sourceId]?.[kind].selectedPath !== preferredPath) throw new Error('所选字幕候选已不可读取')
      if (model.editingProject?.id !== project.id) return
      const baseProject = { ...project, captionSourcePaths: preferredCaptionPaths }
      const sourceRevisionKey = createEditingCaptionSourceRevisionKey(baseProject, snapshot.sourceRevisions)
      const next = { ...replaceEditingCaptionsForReload(baseProject, snapshot.captions, sourceRevisionKey), captionSourceRevisions: snapshot.sourceRevisions, captionSourcePaths: preferredCaptionPaths }
      model.setEditingPast((past) => [...past, project])
      model.setEditingFuture([])
      model.setEditingProject(next)
      model.setEditingSelectedCaptionId(null)
      saveEditingProject(next)
      setEditingCaptionReloadConflict(null)
      const copy = getEditingSubtitleReloadCopy(model.appSettings.ui.locale)
      model.setEditingProjectStatus({ success: true, message: preferredPath === null ? copy.candidateCleared : copy.candidateSelected(preferredPath) })
    } catch (error) {
      const copy = getEditingSubtitleReloadCopy(model.appSettings.ui.locale)
      const failure = preferredPath === null ? copy.candidateClearFailed : copy.candidateSelectionFailed
      model.setEditingProjectStatus({ success: false, message: `${failure}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setIsSelectingEditingCaptionCandidate(null)
    }
  }, [derived.quickTargetLanguage, derived.subtitlePath, derived.subtitleSrtPath, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath, editingCaptionReloadConflict, isSelectingEditingCaptionCandidate, model.appSettings.ui.locale, model.editingProject, model.setEditingFuture, model.setEditingPast, model.setEditingProject, model.setEditingProjectStatus, model.setEditingSelectedCaptionId, model.state.currentFile?.path])

  const selectEditingCaptionCandidate = useCallback(async (sourceId: string, kind: EditingCaption['kind'], path: string): Promise<void> => {
    await changeEditingCaptionCandidate(sourceId, kind, path)
  }, [changeEditingCaptionCandidate])

  const clearEditingCaptionCandidate = useCallback(async (sourceId: string, kind: EditingCaption['kind']): Promise<void> => {
    await changeEditingCaptionCandidate(sourceId, kind, null)
  }, [changeEditingCaptionCandidate])

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

  const rebuildEditingCaptionManifest = useCallback(async (): Promise<void> => {
    const project = model.editingProject
    if (!project || isRebuildingEditingCaptionManifest) return
    setIsRebuildingEditingCaptionManifest(true)
    try {
      const sources = createEditingCaptionSources(project, { currentMediaPath: model.state.currentFile?.path ?? null, subtitlePath: derived.subtitlePath, subtitleSrtPath: derived.subtitleSrtPath, translatedSubtitlePath: derived.translatedSubtitlePath, translatedSubtitleSrtPath: derived.translatedSubtitleSrtPath, translationLanguage: derived.quickTargetLanguage, preferredCaptionPaths: project.captionSourcePaths })
      const { sourceRevisions, sourcePaths } = await loadEditingCaptionSnapshot(sources)
      const sourceRevisionKey = createEditingCaptionSourceRevisionKey(project, sourceRevisions)
      const next = acceptCaptionSourceRevisions(withoutCaptionReloadResolution(project), sourceRevisionKey, sourceRevisions)
      if (model.editingProject?.id !== project.id) return
      model.setEditingProject(next)
      saveEditingProject(next)
      setEditingCaptionReloadConflict(null)
      const candidateStatus = formatEditingCaptionCandidateStatus(project, sourcePaths, model.appSettings.ui.locale)
      model.setEditingProjectStatus(candidateStatus ?? { success: true, message: derived.copy.editing.captionManifestRebuilt })
    } catch (error) {
      model.setEditingProjectStatus({ success: false, message: `${derived.copy.editing.captionManifestRebuildFailed}：${error instanceof Error ? error.message : String(error)}` })
    } finally {
      setIsRebuildingEditingCaptionManifest(false)
    }
  }, [derived.copy.editing.captionManifestRebuildFailed, derived.copy.editing.captionManifestRebuilt, derived.quickTargetLanguage, derived.subtitlePath, derived.subtitleSrtPath, derived.translatedSubtitlePath, derived.translatedSubtitleSrtPath, isRebuildingEditingCaptionManifest, model.editingProject, model.setEditingProject, model.setEditingProjectStatus, model.state.currentFile?.path])

  return { editingCaptionReloadConflict, isRebuildingEditingCaptionManifest, rebuildEditingCaptionManifest, acceptEditingSubtitleReloadChange, acceptEditingSubtitleReloadAddition, removeEditingSubtitleReloadChange, keepEditingSubtitleReloadRemoval, selectEditingCaptionCandidate, clearEditingCaptionCandidate, isSelectingEditingCaptionCandidate, forceReloadEditingCaptions, keepCurrentEditingCaptions }
}
