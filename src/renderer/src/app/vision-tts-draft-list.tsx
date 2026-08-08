import { Download, Trash2 } from 'lucide-react'
import type { MediaEvidenceDraft } from '../../../shared/evidence-task-types'
import type { LocaleCopy } from '../../../shared/i18n'

type VisionTtsDraftListProps = {
  copy: LocaleCopy['vision']
  drafts: MediaEvidenceDraft[]
  pendingImportId: string | null
  draftBusyId: string | null
  draftNotice: string | null
  onImport: (draft: MediaEvidenceDraft, overwriteExisting: boolean) => void
  onDelete: (draft: MediaEvidenceDraft) => void
  onCancelImport: () => void
}

function formatSeconds(value: number): string {
  return Math.max(0, value).toFixed(1)
}

export function VisionTtsDraftList({ copy, drafts, pendingImportId, draftBusyId, draftNotice, onImport, onDelete, onCancelImport }: VisionTtsDraftListProps): React.ReactElement | null {
  if (drafts.length === 0) return null
  return <div className="vision-tts-draft-list" data-testid="vision-tts-draft-list">
    <div className="vision-tts-draft-list-heading"><div><strong>{copy.ttsDraftListTitle}</strong><small>{copy.ttsDraftListDescription}</small></div><Download size={15} /></div>
    {drafts.map((draft) => {
      const isBusy = draftBusyId === draft.id
      const isPending = pendingImportId === draft.id
      return <article className="vision-tts-draft-item" data-testid={`vision-tts-draft-${draft.id}`} key={draft.id}>
        <div className="vision-tts-draft-item-copy"><strong>{draft.text}</strong><small>{formatSeconds(draft.startSeconds)}s – {formatSeconds(draft.endSeconds)}s · {draft.draftPath.split(/[\\/]/).pop()}</small></div>
        <div className="vision-tts-draft-item-actions">
          <button className="vision-secondary-action" data-testid={`vision-tts-import-${draft.id}`} type="button" onClick={() => onImport(draft, false)} disabled={Boolean(draftBusyId)}><Download size={13} />{copy.ttsDraftImport}</button>
          <button className="vision-secondary-action" data-testid={`vision-tts-delete-${draft.id}`} type="button" onClick={() => onDelete(draft)} disabled={Boolean(draftBusyId)}><Trash2 size={13} />{copy.ttsDraftDelete}</button>
        </div>
        {isPending ? <div className="vision-tts-overwrite-confirm" role="alert"><span>{copy.ttsDraftOverwriteDescription}</span><div className="vision-tts-draft-item-actions"><button className="vision-primary-action" data-testid="vision-tts-confirm-import-button" type="button" onClick={() => onImport(draft, true)} disabled={isBusy}>{copy.ttsDraftConfirmOverwrite}</button><button className="vision-secondary-action" type="button" onClick={onCancelImport} disabled={isBusy}>{copy.ttsDraftCancelImport}</button></div></div> : null}
      </article>
    })}
    {draftNotice ? <small className="vision-tts-draft-saved" data-testid="vision-tts-draft-notice">{draftNotice}</small> : null}
  </div>
}
