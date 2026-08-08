import { AlertTriangle, ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react'
import type { EditingSubtitleReloadChange } from '../../../core/editing/subtitle-reload'
import type { EditingSubtitleReloadCopy } from '../../../shared/editing-subtitle-reload-copy'
import type { EditingCaptionReloadConflict } from './use-editing-caption-effect'

type EditingCaptionReloadConflictProps = {
  conflict: EditingCaptionReloadConflict
  copy: EditingSubtitleReloadCopy
  onKeepCurrent: () => void
  onForceReload: () => void
}

function statusLabel(change: EditingSubtitleReloadChange, copy: EditingSubtitleReloadCopy): string {
  if (change.status === 'added') return copy.addedLabel
  if (change.status === 'removed') return copy.removedLabel
  return copy.changedLabel
}

function kindLabel(change: EditingSubtitleReloadChange, copy: EditingSubtitleReloadCopy): string {
  return change.kind === 'source' ? copy.source : copy.translation
}

export function EditingCaptionReloadConflict({ conflict, copy, onKeepCurrent, onForceReload }: EditingCaptionReloadConflictProps): React.ReactElement {
  const { preview } = conflict
  return (
    <section className="editing-caption-reload-conflict" data-testid="editing-caption-reload-conflict" role="alert">
      <div className="editing-caption-reload-heading">
        <AlertTriangle size={15} aria-hidden="true" />
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.description}</p>
        </div>
      </div>
      <div className="editing-caption-reload-summary" aria-label={copy.preview}>
        {preview.changedCount > 0 ? <span>{copy.changed(preview.changedCount)}</span> : null}
        {preview.addedCount > 0 ? <span>{copy.added(preview.addedCount)}</span> : null}
        {preview.removedCount > 0 ? <span>{copy.removed(preview.removedCount)}</span> : null}
      </div>
      <details className="editing-caption-reload-details" data-testid="editing-caption-reload-preview">
        <summary>{copy.preview}</summary>
        <div className="editing-caption-reload-list">
          {preview.changes.map((change) => (
            <div className={`editing-caption-reload-row is-${change.status}`} key={`${change.status}-${change.kind}-${change.id}`}>
              <div className="editing-caption-reload-row-meta"><span>{statusLabel(change, copy)}</span><small>{kindLabel(change, copy)}</small></div>
              <div className="editing-caption-reload-values">
                <span title={copy.current}>{change.currentText ?? copy.empty}</span>
                <ArrowRight size={12} aria-hidden="true" />
                <span title={copy.incoming}>{change.incomingText ?? copy.empty}</span>
              </div>
            </div>
          ))}
        </div>
      </details>
      <div className="editing-caption-reload-actions">
        <button className="editing-caption-reload-keep" type="button" onClick={onKeepCurrent} data-testid="editing-caption-reload-keep"><ShieldCheck size={13} aria-hidden="true" />{copy.keep}</button>
        <button className="editing-caption-reload-force" type="button" onClick={onForceReload} data-testid="editing-caption-reload-force"><RefreshCw size={13} aria-hidden="true" />{copy.force}</button>
      </div>
    </section>
  )
}
