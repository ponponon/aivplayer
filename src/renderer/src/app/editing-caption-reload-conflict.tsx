import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck } from 'lucide-react'
import { EDITING_SUBTITLE_RELOAD_PAGE_SIZE, getEditingSubtitleReloadChangePage, type EditingSubtitleReloadChange, type EditingSubtitleReloadChangeKindFilter, type EditingSubtitleReloadChangeStatusFilter } from '../../../core/editing/subtitle-reload'
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
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<EditingSubtitleReloadChangeStatusFilter>('all')
  const [kind, setKind] = useState<EditingSubtitleReloadChangeKindFilter>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const changePage = getEditingSubtitleReloadChangePage(preview.changes, { query, status, kind, pageIndex, pageSize: EDITING_SUBTITLE_RELOAD_PAGE_SIZE })

  useEffect(() => {
    setQuery('')
    setStatus('all')
    setKind('all')
    setPageIndex(0)
  }, [conflict])

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
        <div className="editing-caption-reload-filters">
          <label className="editing-caption-reload-search">
            <Search size={12} aria-hidden="true" />
            <span className="editing-caption-reload-visually-hidden">{copy.searchLabel}</span>
            <input value={query} onChange={(event) => { setQuery(event.currentTarget.value); setPageIndex(0) }} placeholder={copy.searchPlaceholder} aria-label={copy.searchLabel} data-testid="editing-caption-reload-search" />
          </label>
          <label>
            <span className="editing-caption-reload-visually-hidden">{copy.statusFilter}</span>
            <select value={status} onChange={(event) => { setStatus(event.currentTarget.value as EditingSubtitleReloadChangeStatusFilter); setPageIndex(0) }} aria-label={copy.statusFilter} data-testid="editing-caption-reload-status-filter">
              <option value="all">{copy.allChanges}</option>
              <option value="changed">{copy.changedLabel}</option>
              <option value="added">{copy.addedLabel}</option>
              <option value="removed">{copy.removedLabel}</option>
            </select>
          </label>
          <label>
            <span className="editing-caption-reload-visually-hidden">{copy.trackFilter}</span>
            <select value={kind} onChange={(event) => { setKind(event.currentTarget.value as EditingSubtitleReloadChangeKindFilter); setPageIndex(0) }} aria-label={copy.trackFilter} data-testid="editing-caption-reload-kind-filter">
              <option value="all">{copy.allTracks}</option>
              <option value="source">{copy.source}</option>
              <option value="translation">{copy.translation}</option>
            </select>
          </label>
        </div>
        <div className="editing-caption-reload-list">
          {changePage.changes.map((change) => (
            <div className={`editing-caption-reload-row is-${change.status}`} key={`${change.status}-${change.kind}-${change.id}`}>
              <div className="editing-caption-reload-row-meta"><span>{statusLabel(change, copy)}</span><small>{kindLabel(change, copy)}</small></div>
              <div className="editing-caption-reload-values">
                <span title={copy.current}>{change.currentText ?? copy.empty}</span>
                <ArrowRight size={12} aria-hidden="true" />
                <span title={copy.incoming}>{change.incomingText ?? copy.empty}</span>
              </div>
            </div>
          ))}
          {changePage.total === 0 ? <p className="editing-caption-reload-empty" data-testid="editing-caption-reload-no-matches">{copy.noMatches}</p> : null}
        </div>
        <div className="editing-caption-reload-pagination">
          <span>{copy.resultCount(changePage.total)}</span>
          <span>{copy.page(changePage.pageIndex + 1, changePage.pageCount)}</span>
          <button type="button" onClick={() => setPageIndex((current) => Math.max(0, current - 1))} disabled={changePage.pageIndex === 0} aria-label={copy.previous} data-testid="editing-caption-reload-previous"><ChevronLeft size={13} aria-hidden="true" />{copy.previous}</button>
          <button type="button" onClick={() => setPageIndex((current) => Math.min(changePage.pageCount - 1, current + 1))} disabled={changePage.pageIndex >= changePage.pageCount - 1} aria-label={copy.next} data-testid="editing-caption-reload-next">{copy.next}<ChevronRight size={13} aria-hidden="true" /></button>
        </div>
      </details>
      <div className="editing-caption-reload-actions">
        <button className="editing-caption-reload-keep" type="button" onClick={onKeepCurrent} data-testid="editing-caption-reload-keep"><ShieldCheck size={13} aria-hidden="true" />{copy.keep}</button>
        <button className="editing-caption-reload-force" type="button" onClick={onForceReload} data-testid="editing-caption-reload-force"><RefreshCw size={13} aria-hidden="true" />{copy.force}</button>
      </div>
    </section>
  )
}
