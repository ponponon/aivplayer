import { useEffect, useState } from 'react'
import type { MediaEvidenceDraft, MediaEvidenceDraftImportResult, MediaEvidenceDraftSaveRequest } from '../../../shared/evidence-task-types'
import type { LocaleCopy } from '../../../shared/i18n'

type UseVisionTtsDraftsOptions = {
  copy: LocaleCopy['vision']
  mediaPath: string | null
  onSubtitleImported?: (result: MediaEvidenceDraftImportResult) => void
  onError: (message: string) => void
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason)
}

export function useVisionTtsDrafts({ copy, mediaPath, onSubtitleImported, onError }: UseVisionTtsDraftsOptions) {
  const [draft, setDraft] = useState<MediaEvidenceDraft | null>(null)
  const [drafts, setDrafts] = useState<MediaEvidenceDraft[]>([])
  const [pendingImport, setPendingImport] = useState<MediaEvidenceDraft | null>(null)
  const [draftBusyId, setDraftBusyId] = useState<string | null>(null)
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  const [selectedDraftIds, setSelectedDraftIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    let active = true
    if (!mediaPath) {
      setDrafts([])
      setPendingImport(null)
      setSelectedDraftIds(new Set())
      return () => { active = false }
    }
    void window.aiv.listMediaEvidenceDrafts().then((nextDrafts) => {
      if (active) {
        setDrafts(nextDrafts.filter((candidate) => candidate.mediaPath === mediaPath))
        setSelectedDraftIds(new Set())
      }
    }).catch((reason: unknown) => {
      if (active) onError(errorMessage(reason))
    })
    return () => { active = false }
  }, [mediaPath, onError])

  const clearCurrentDraft = (): void => setDraft(null)
  const clearPendingImport = (): void => setPendingImport(null)

  const toggleDraftSelection = (draftId: string): void => {
    setSelectedDraftIds((current) => {
      const next = new Set(current)
      if (next.has(draftId)) next.delete(draftId)
      else next.add(draftId)
      return next
    })
  }

  const saveDraft = async (request: MediaEvidenceDraftSaveRequest): Promise<void> => {
    try {
      const savedDraft = await window.aiv.saveMediaEvidenceDraft(request)
      setDraft(savedDraft)
      setDrafts((current) => [savedDraft, ...current.filter((candidate) => candidate.id !== savedDraft.id)])
      setSelectedDraftIds(new Set())
      setDraftNotice(copy.ttsDraftSaved)
    } catch (reason) {
      onError(errorMessage(reason))
    }
  }

  const deleteDraft = (candidate: MediaEvidenceDraft): void => {
    if (draftBusyId) return
    setDraftBusyId(candidate.id)
    void window.aiv.deleteMediaEvidenceDraft(candidate.id).then((deleted) => {
      if (!deleted) return
      setDrafts((current) => current.filter((item) => item.id !== candidate.id))
      setSelectedDraftIds((current) => {
        const next = new Set(current)
        next.delete(candidate.id)
        return next
      })
      setDraft((current) => current?.id === candidate.id ? null : current)
      setPendingImport((current) => current?.id === candidate.id ? null : current)
      setDraftNotice(copy.ttsDraftDeleted)
    }).catch((reason: unknown) => onError(errorMessage(reason))).finally(() => setDraftBusyId(null))
  }

  const mergeSelectedDrafts = (): void => {
    if (!mediaPath || selectedDraftIds.size < 2 || draftBusyId) return
    const selectedDrafts = drafts.filter((candidate) => selectedDraftIds.has(candidate.id))
    const sourceFingerprints = new Set(selectedDrafts.map((candidate) => candidate.sourceFingerprint))
    if (selectedDrafts.length < 2 || sourceFingerprints.size !== 1) {
      onError('只能合并同一媒体版本的字幕草稿')
      return
    }
    setDraftBusyId('merge')
    void window.aiv.saveMediaEvidenceDraft({
      mediaPath,
      sourceFingerprint: selectedDrafts[0]?.sourceFingerprint ?? '',
      cues: selectedDrafts.flatMap((candidate) => candidate.cues)
    }).then((mergedDraft) => {
      setDraft(mergedDraft)
      setDrafts((current) => [mergedDraft, ...current.filter((candidate) => candidate.id !== mergedDraft.id)])
      setSelectedDraftIds(new Set())
      setDraftNotice(copy.ttsDraftMerged(mergedDraft.cues.length))
    }).catch((reason: unknown) => onError(errorMessage(reason))).finally(() => setDraftBusyId(null))
  }

  const importDraft = (candidate: MediaEvidenceDraft, overwriteExisting: boolean): void => {
    if (!mediaPath || draftBusyId) return
    setDraftBusyId(candidate.id)
    void window.aiv.importMediaEvidenceDraft({ draftId: candidate.id, mediaPath, overwriteExisting }).then((result) => {
      if (result.requiresOverwriteConfirmation) {
        setPendingImport(candidate)
        setDraftNotice(result.message)
        return
      }
      setPendingImport(null)
      setDraftNotice(result.message)
      if (result.success) onSubtitleImported?.(result)
    }).catch((reason: unknown) => onError(errorMessage(reason))).finally(() => setDraftBusyId(null))
  }

  return { draft, drafts, pendingImport, draftBusyId, draftNotice, selectedDraftIds, clearCurrentDraft, clearPendingImport, toggleDraftSelection, saveDraft, deleteDraft, importDraft, mergeSelectedDrafts }
}
