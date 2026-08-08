import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowRight, Check, ChevronLeft, ChevronRight, RefreshCw, Search, ShieldCheck, Trash2 } from 'lucide-react'
import { EDITING_SUBTITLE_RELOAD_PAGE_SIZE, getEditingSubtitleReloadChangePage, getEditingSubtitleReloadChangeScriptSegmentId, getEditingSubtitleReloadChangeTimeRange, type EditingSubtitleReloadChange, type EditingSubtitleReloadChangeKindFilter, type EditingSubtitleReloadChangeStatusFilter } from '../../../core/editing/subtitle-reload'
import type { EditingSubtitleReloadCopy } from '../../../shared/editing-subtitle-reload-copy'
import type { EditingCaptionReloadConflict } from './use-editing-caption-effect'

type EditingCaptionReloadConflictProps = {
  conflict: EditingCaptionReloadConflict
  copy: EditingSubtitleReloadCopy
  onSeek: (seconds: number) => void
  onPreviewIncoming: (change: EditingSubtitleReloadChange) => void
  onAcceptIncoming: (change: EditingSubtitleReloadChange) => void
  onAddIncoming: (change: EditingSubtitleReloadChange) => void
  onRemoveCurrent: (change: EditingSubtitleReloadChange) => void
  onKeepCurrentChange: (change: EditingSubtitleReloadChange) => void
  onSelectScriptSegment: (segmentId: string) => void
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

function sourceLabel(change: EditingSubtitleReloadChange, conflict: EditingCaptionReloadConflict, copy: EditingSubtitleReloadCopy): { name: string; path?: string } {
  const source = change.sourceId ? conflict.sources.find((candidate) => candidate.id === change.sourceId) : undefined
  return source ? { name: source.name, path: source.path } : { name: copy.unknownSource }
}

function incomingActionLabel(change: EditingSubtitleReloadChange, copy: EditingSubtitleReloadCopy): string {
  return change.status === 'added' ? copy.previewIncoming : copy.seekIncoming
}

function formatSubtitleReloadTime(seconds: number | undefined): string {
  if (seconds === undefined || !Number.isFinite(seconds)) return '—'
  const minutes = Math.floor(seconds / 60)
  const wholeSeconds = Math.floor(seconds % 60)
  const tenths = Math.floor((seconds - Math.floor(seconds)) * 10)
  return `${String(minutes).padStart(2, '0')}:${String(wholeSeconds).padStart(2, '0')}.${tenths}`
}

function changeTimeLabel(change: EditingSubtitleReloadChange): string {
  const range = getEditingSubtitleReloadChangeTimeRange(change)
  if (range.startSeconds === undefined || range.endSeconds === undefined) return '—'
  return `${formatSubtitleReloadTime(range.startSeconds)}–${formatSubtitleReloadTime(range.endSeconds)}`
}

function parseSeconds(value: string): number | undefined {
  if (!value.trim()) return undefined
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined
}

export function EditingCaptionReloadConflict({ conflict, copy, onSeek, onPreviewIncoming, onAcceptIncoming, onAddIncoming, onRemoveCurrent, onKeepCurrentChange, onSelectScriptSegment, onKeepCurrent, onForceReload }: EditingCaptionReloadConflictProps): React.ReactElement {
  const { preview } = conflict
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<EditingSubtitleReloadChangeStatusFilter>('all')
  const [kind, setKind] = useState<EditingSubtitleReloadChangeKindFilter>('all')
  const [timeStart, setTimeStart] = useState('')
  const [timeEnd, setTimeEnd] = useState('')
  const [pageIndex, setPageIndex] = useState(0)
  const changePage = getEditingSubtitleReloadChangePage(preview.changes, { query, status, kind, timeStartSeconds: parseSeconds(timeStart), timeEndSeconds: parseSeconds(timeEnd), pageIndex, pageSize: EDITING_SUBTITLE_RELOAD_PAGE_SIZE })
  const seekChange = (change: EditingSubtitleReloadChange, seconds: number): void => {
    onPreviewIncoming(change)
    onSelectScriptSegment(getEditingSubtitleReloadChangeScriptSegmentId(change))
    onSeek(seconds)
  }

  useEffect(() => {
    setQuery('')
    setStatus('all')
    setKind('all')
    setTimeStart('')
    setTimeEnd('')
    setPageIndex(0)
  }, [conflict.sourceRevisionKey, conflict.preview.changes.map((change) => `${change.status}:${change.kind}:${change.sourceId ?? ''}:${change.id}`).join('|')])

  return (
    <section className="editing-caption-reload-conflict" data-testid="editing-caption-reload-conflict" role="alert">
      <div className="editing-caption-reload-heading">
        <AlertTriangle size={15} aria-hidden="true" />
        <div>
          <strong>{copy.title}</strong>
          <p>{copy.description}</p>
          <small className="editing-caption-reload-independent-hint">{copy.independentRemovalHint}</small>
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
        <div className="editing-caption-reload-time-filter" aria-label={copy.timeRange}>
          <span>{copy.timeRange}</span>
          <label><span className="editing-caption-reload-visually-hidden">{copy.timeStart}</span><input type="number" min="0" step="0.1" value={timeStart} onChange={(event) => { setTimeStart(event.currentTarget.value); setPageIndex(0) }} placeholder={copy.timeStart} aria-label={copy.timeStart} data-testid="editing-caption-reload-time-start" /></label>
          <span aria-hidden="true">–</span>
          <label><span className="editing-caption-reload-visually-hidden">{copy.timeEnd}</span><input type="number" min="0" step="0.1" value={timeEnd} onChange={(event) => { setTimeEnd(event.currentTarget.value); setPageIndex(0) }} placeholder={copy.timeEnd} aria-label={copy.timeEnd} data-testid="editing-caption-reload-time-end" /></label>
        </div>
        <div className="editing-caption-reload-list">
          {changePage.changes.map((change) => (
            <div className={`editing-caption-reload-row is-${change.status}`} key={`${change.status}-${change.kind}-${change.sourceId ?? 'unknown'}-${change.id}`}>
              <div className="editing-caption-reload-row-meta"><span>{statusLabel(change, copy)}</span><small>{kindLabel(change, copy)}</small><small className="editing-caption-reload-row-source" title={sourceLabel(change, conflict, copy).path}>{copy.sourceFile}：{sourceLabel(change, conflict, copy).name}</small><small className="editing-caption-reload-row-time">{changeTimeLabel(change)}</small></div>
              <div className="editing-caption-reload-values">
                <span title={copy.current}>{change.currentText ?? copy.empty}</span>
                <ArrowRight size={12} aria-hidden="true" />
                <span title={copy.incoming}>{change.incomingText ?? copy.empty}</span>
              </div>
              <div className="editing-caption-reload-seek-actions">
                <button type="button" disabled={change.currentStartSeconds === undefined} onClick={() => change.currentStartSeconds !== undefined && seekChange(change, change.currentStartSeconds)} title={copy.seekCurrent} data-testid={`editing-caption-reload-seek-current-${change.status}-${change.kind}-${change.id}`}>{copy.seekCurrent} {formatSubtitleReloadTime(change.currentStartSeconds)}</button>
                <button type="button" disabled={change.incomingStartSeconds === undefined} onClick={() => change.incomingStartSeconds !== undefined && seekChange(change, change.incomingStartSeconds)} title={incomingActionLabel(change, copy)} data-testid={`editing-caption-reload-seek-incoming-${change.status}-${change.kind}-${change.id}`}>{incomingActionLabel(change, copy)} {formatSubtitleReloadTime(change.incomingStartSeconds)}</button>
                {change.status === 'changed' ? <button className="editing-caption-reload-accept" type="button" onClick={() => onAcceptIncoming(change)} title={copy.acceptIncoming} data-testid={`editing-caption-reload-accept-${change.kind}-${change.id}`}><Check size={12} aria-hidden="true" />{copy.acceptIncoming}</button> : null}
                {change.status === 'added' ? <button className="editing-caption-reload-add" type="button" onClick={() => onAddIncoming(change)} title={copy.addIncoming} data-testid={`editing-caption-reload-add-${change.kind}-${change.id}`}><Check size={12} aria-hidden="true" />{copy.addIncoming}</button> : null}
                {change.status === 'removed' ? <><button className="editing-caption-reload-keep-current" type="button" onClick={() => onKeepCurrentChange(change)} title={copy.keepCurrentCaption} data-testid={`editing-caption-reload-keep-current-${change.kind}-${change.id}`}><ShieldCheck size={12} aria-hidden="true" />{copy.keepCurrentCaption}</button><button className="editing-caption-reload-remove" type="button" onClick={() => onRemoveCurrent(change)} title={copy.removeFromProject} data-testid={`editing-caption-reload-remove-${change.kind}-${change.id}`}><Trash2 size={12} aria-hidden="true" />{copy.removeFromProject}</button></> : null}
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
