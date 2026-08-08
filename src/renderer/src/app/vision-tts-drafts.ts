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

  useEffect(() => {
    let active = true
    if (!mediaPath) {
      setDrafts([])
      setPendingImport(null)
      return () => { active = false }
    }
    void window.aiv.listMediaEvidenceDrafts().then((nextDrafts) => {
      if (active) setDrafts(nextDrafts.filter((candidate) => candidate.mediaPath === mediaPath))
    }).catch((reason: unknown) => {
      if (active) onError(errorMessage(reason))
    })
    return () => { active = false }
  }, [mediaPath, onError])

  const clearCurrentDraft = (): void => setDraft(null)
  const clearPendingImport = (): void => setPendingImport(null)

  const saveDraft = async (request: MediaEvidenceDraftSaveRequest): Promise<void> => {
    try {
      const savedDraft = await window.aiv.saveMediaEvidenceDraft(request)
      setDraft(savedDraft)
      setDrafts((current) => [savedDraft, ...current.filter((candidate) => candidate.id !== savedDraft.id)])
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
      setDraft((current) => current?.id === candidate.id ? null : current)
      setPendingImport((current) => current?.id === candidate.id ? null : current)
      setDraftNotice(copy.ttsDraftDeleted)
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

  return { draft, drafts, pendingImport, draftBusyId, draftNotice, clearCurrentDraft, clearPendingImport, saveDraft, deleteDraft, importDraft }
}
