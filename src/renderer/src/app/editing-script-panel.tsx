import { FileText, RotateCcw, Trash2 } from 'lucide-react'
import type { EditingScriptSegment } from '../../../shared/editing-types'
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
  countLabel: (active: number, total: number) => string
  onSelect: (segmentId: string) => void
  onDelete: (segmentId: string) => void
  onRestore: (segmentId: string) => void
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
  countLabel,
  onSelect,
  onDelete,
  onRestore
}: EditingScriptPanelProps): React.ReactElement {
  const activeCount = segments.filter((segment) => !segment.deleted).length
  return <section className="editing-script-panel" data-testid="editing-script-panel" aria-label={title}>
    <div className="editing-script-heading">
      <div className="editing-script-title"><FileText size={13} aria-hidden="true" /><strong>{title}</strong><span>{countLabel(activeCount, segments.length)}</span></div>
      <p>{hint}</p>
    </div>
    {segments.length > 0 ? <div className="editing-script-list" data-testid="editing-script-list">
      {segments.map((segment) => <div key={segment.id} className={`editing-script-row ${segment.deleted ? 'is-deleted' : ''} ${selectedSegmentId === segment.id ? 'is-selected' : ''}`}>
        <button className="editing-script-row-main" type="button" onClick={() => onSelect(segment.id)} disabled={segment.deleted} aria-label={`${formatTime(segment.sourceStartSeconds)} ${segment.text}`}>
          <span className="editing-script-time">{formatTime(segment.sourceStartSeconds)}–{formatTime(segment.sourceEndSeconds)}</span>
          <span className="editing-script-text">{segment.text}</span>
          {segment.deleted ? <span className="editing-script-deleted">{deletedLabel}</span> : null}
        </button>
        {segment.deleted ? <button className="editing-script-action" type="button" onClick={() => onRestore(segment.id)} title={restoreLabel} aria-label={restoreLabel}><RotateCcw size={12} /></button> : <button className="editing-script-action is-danger" type="button" onClick={() => onDelete(segment.id)} title={deleteLabel} aria-label={deleteLabel}><Trash2 size={12} /></button>}
      </div>)}
    </div> : <div className="editing-script-empty"><FileText size={14} aria-hidden="true" /><span>{emptyLabel}</span></div>}
  </section>
}
