import { Check, FileText, Pencil, RotateCcw, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { EditingCaptionWord, EditingScriptSegment } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'

type EditingScriptPanelProps = {
  segments: readonly EditingScriptSegment[]
  selectedSegmentId: string | null
  title: string
  hint: string
  emptyLabel: string
  deleteLabel: string
  restoreLabel: string
  deletedLabel: string
  editLabel: string
  saveLabel: string
  cancelLabel: string
  editPlaceholder: string
  countLabel: (active: number, total: number) => string
  onSelect: (segmentId: string) => void
  onUpdate: (segmentId: string, text: string) => void
  onDelete: (segmentId: string) => void
  onRestore: (segmentId: string) => void
  onDeleteWord: (segmentId: string, word: EditingCaptionWord) => void
}

export function EditingScriptPanel({
  segments,
  selectedSegmentId,
  title,
  hint,
  emptyLabel,
  deleteLabel,
  restoreLabel,
  deletedLabel,
  editLabel,
  saveLabel,
  cancelLabel,
  editPlaceholder,
  countLabel,
  onSelect,
  onUpdate,
  onDelete,
  onRestore,
  onDeleteWord
}: EditingScriptPanelProps): React.ReactElement {
  const [editingSegmentId, setEditingSegmentId] = useState<string | null>(null)
  const [draftText, setDraftText] = useState('')
  const activeCount = segments.filter((segment) => !segment.deleted).length
  const beginEdit = (segment: EditingScriptSegment): void => {
    if (segment.deleted) return
    onSelect(segment.id)
    setEditingSegmentId(segment.id)
    setDraftText(segment.text)
  }
  const cancelEdit = (): void => {
    setEditingSegmentId(null)
    setDraftText('')
  }
  const saveEdit = (segmentId: string): void => {
    if (draftText.trim()) onUpdate(segmentId, draftText)
    cancelEdit()
  }
  return <section className="editing-script-panel" data-testid="editing-script-panel" aria-label={title}>
    <div className="editing-script-heading">
      <div className="editing-script-title"><FileText size={13} aria-hidden="true" /><strong>{title}</strong><span>{countLabel(activeCount, segments.length)}</span></div>
      <p>{hint}</p>
    </div>
    {segments.length > 0 ? <div className="editing-script-list" data-testid="editing-script-list">
      {segments.map((segment) => <div key={segment.id} className={`editing-script-row ${segment.deleted ? 'is-deleted' : ''} ${selectedSegmentId === segment.id ? 'is-selected' : ''}`}>
        {editingSegmentId === segment.id ? <div className="editing-script-editor">
          <span className="editing-script-time">{formatTime(segment.sourceStartSeconds)}–{formatTime(segment.sourceEndSeconds)}</span>
          <input className="editing-script-input" type="text" value={draftText} placeholder={editPlaceholder} aria-label={editLabel} autoFocus onChange={(event) => setDraftText(event.currentTarget.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); saveEdit(segment.id) } if (event.key === 'Escape') { event.preventDefault(); cancelEdit() } }} data-testid={`editing-script-input-${segment.id}`} />
          <div className="editing-script-editor-actions">
            <button className="editing-script-action" type="button" onClick={() => saveEdit(segment.id)} title={saveLabel} aria-label={saveLabel} data-testid={`editing-script-save-${segment.id}`}><Check size={12} /></button>
            <button className="editing-script-action" type="button" onClick={cancelEdit} title={cancelLabel} aria-label={cancelLabel} data-testid={`editing-script-cancel-${segment.id}`}><X size={12} /></button>
          </div>
        </div> : <>
          <div className="editing-script-row-main" role="button" tabIndex={segment.deleted ? -1 : 0} onClick={() => onSelect(segment.id)} onDoubleClick={() => beginEdit(segment)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelect(segment.id) } }} aria-disabled={segment.deleted} aria-label={`${formatTime(segment.sourceStartSeconds)} ${segment.text}`}>
            <span className="editing-script-time">{formatTime(segment.sourceStartSeconds)}–{formatTime(segment.sourceEndSeconds)}</span>
            <span className="editing-script-text">{segment.words && segment.words.length > 0 ? segment.words.map((word, index) => <button className="editing-script-word" key={`${word.startSeconds}-${word.endSeconds}-${index}`} type="button" title={deleteLabel} aria-label={`${deleteLabel}: ${word.text.trim()}`} onClick={(event) => { event.stopPropagation(); onSelect(segment.id); onDeleteWord(segment.id, word) }} data-testid={`editing-script-word-${segment.id}-${index}`}>{word.text}</button>) : segment.text}</span>
            {segment.deleted ? <span className="editing-script-deleted">{deletedLabel}</span> : null}
          </div>
          {!segment.deleted ? <button className="editing-script-action" type="button" onClick={() => beginEdit(segment)} title={editLabel} aria-label={editLabel} data-testid={`editing-script-edit-${segment.id}`}><Pencil size={12} /></button> : null}
          {segment.deleted ? <button className="editing-script-action" type="button" onClick={() => onRestore(segment.id)} title={restoreLabel} aria-label={restoreLabel}><RotateCcw size={12} /></button> : <button className="editing-script-action is-danger" type="button" onClick={() => onDelete(segment.id)} title={deleteLabel} aria-label={deleteLabel}><Trash2 size={12} /></button>}
        </>}
      </div>)}
    </div> : <div className="editing-script-empty"><FileText size={14} aria-hidden="true" /><span>{emptyLabel}</span></div>}
  </section>
}
