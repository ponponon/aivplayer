import { Archive, CheckSquare, Database, FolderOpen, FolderSync, Square, Trash2, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import { filterMediaImportInboxItems } from '../../../core/media/media-import-inbox-filter'
import type { MediaImportInboxBatchAction, MediaImportInboxItem, MediaImportInboxMetadataPatch, MediaImportInboxPipelineProgress, MediaImportInboxScanProgress, MediaImportInboxStatus } from '../../../shared/media-import-inbox'

type VisionImportInboxProps = {
  copy: LocaleCopy['vision']
  directories: string[]
  items: MediaImportInboxItem[]
  progress: MediaImportInboxScanProgress | null
  pipelineProgress: MediaImportInboxPipelineProgress | null
  isBusy: boolean
  error: string | null
  writeSidecars: boolean
  onAddFolder: () => void
  onRemoveFolder: (directoryPath: string) => void
  onScan: () => void
  onQueue: (item: MediaImportInboxItem) => void
  onIgnore: (item: MediaImportInboxItem) => void
  onRetry: (item: MediaImportInboxItem) => void
  onBatchQueue: (items: MediaImportInboxItem[]) => Promise<void>
  onBatchIgnore: (items: MediaImportInboxItem[]) => Promise<void>
  onBatchRetry: (items: MediaImportInboxItem[]) => Promise<void>
  onBatchClear: (items: MediaImportInboxItem[]) => Promise<void>
  onWriteSidecarsChange: (value: boolean) => void
  onUpdateMetadata: (item: MediaImportInboxItem, patch: MediaImportInboxMetadataPatch) => void
}

const BATCH_SELECTABLE_STATUSES: MediaImportInboxItem['status'][] = ['discovered', 'failed', 'ignored', 'missing']

function statusClass(status: MediaImportInboxItem['status']): string {
  return `vision-inbox-status vision-inbox-status-${status}`
}

function isBatchSelectable(item: MediaImportInboxItem): boolean {
  return BATCH_SELECTABLE_STATUSES.includes(item.status)
}

function canApplyBatch(items: MediaImportInboxItem[], action: MediaImportInboxBatchAction): boolean {
  if (items.length === 0) return false
  if (action === 'clear') return items.every((item) => item.status === 'ignored' || item.status === 'missing')
  if (action === 'retry') return items.every((item) => item.status === 'failed' || item.status === 'ignored' || item.status === 'missing')
  return items.every((item) => item.status === 'discovered' || item.status === 'failed')
}

export function VisionImportInbox({ copy, directories, items, progress, pipelineProgress, isBusy, error, writeSidecars, onAddFolder, onRemoveFolder, onScan, onQueue, onIgnore, onRetry, onBatchQueue, onBatchIgnore, onBatchRetry, onBatchClear, onWriteSidecarsChange, onUpdateMetadata }: VisionImportInboxProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<MediaImportInboxStatus | 'all'>('all')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set())
  const [batchAction, setBatchAction] = useState<MediaImportInboxBatchAction | null>(null)
  const filteredItems = useMemo(() => filterMediaImportInboxItems(items, { query, status, favoriteOnly }), [favoriteOnly, items, query, status])
  const visibleItems = filteredItems.slice(0, 8)
  const selectableVisibleItems = visibleItems.filter(isBatchSelectable)
  const selectedItems = items.filter((item) => selectedItemIds.has(item.id))
  const allVisibleSelected = selectableVisibleItems.length > 0 && selectableVisibleItems.every((item) => selectedItemIds.has(item.id))

  useEffect(() => {
    setSelectedItemIds((current) => {
      const availableIds = new Set(items.filter(isBatchSelectable).map((item) => item.id))
      const next = new Set([...current].filter((itemId) => availableIds.has(itemId)))
      return next.size === current.size ? current : next
    })
  }, [items])

  const toggleSelection = (itemId: string): void => {
    setSelectedItemIds((current) => {
      const next = new Set(current)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  const toggleAllVisible = (): void => {
    setSelectedItemIds((current) => {
      const next = new Set(current)
      if (allVisibleSelected) selectableVisibleItems.forEach((item) => next.delete(item.id))
      else selectableVisibleItems.forEach((item) => next.add(item.id))
      return next
    })
  }

  const runBatch = async (action: MediaImportInboxBatchAction): Promise<void> => {
    if (!canApplyBatch(selectedItems, action) || batchAction) return
    setBatchAction(action)
    try {
      if (action === 'queue') await onBatchQueue(selectedItems)
      else if (action === 'ignore') await onBatchIgnore(selectedItems)
      else if (action === 'retry') await onBatchRetry(selectedItems)
      else await onBatchClear(selectedItems)
      setSelectedItemIds(new Set())
    } catch {
      // The hook has already exposed the failure in the panel-level error area.
    } finally {
      setBatchAction(null)
    }
  }

  return <section className="vision-import-inbox">
    <div className="vision-heading"><div><span className="panel-kicker">{copy.inboxTitle}</span><h3>{copy.inboxTitle}</h3></div><Archive size={16} /></div>
    <p className="vision-inbox-description">{copy.inboxDescription}</p>
    <div className="vision-folder-actions">
      <button className="vision-secondary-action" type="button" onClick={onAddFolder} disabled={isBusy}><FolderOpen size={14} />{copy.inboxChooseFolder}</button>
      <button className="vision-primary-action" type="button" onClick={onScan} disabled={isBusy || directories.length === 0}><FolderSync size={14} />{isBusy ? copy.inboxScanning : copy.inboxScan}</button>
      <span className="vision-inbox-watch-label">{copy.inboxWatching(directories.length)}</span>
      <label className="vision-folder-option"><input type="checkbox" checked={writeSidecars} onChange={(event) => onWriteSidecarsChange(event.target.checked)} /><span>{copy.inboxWriteSidecars}</span></label>
    </div>
    {directories.length > 0 ? <div className="vision-inbox-directories">{directories.map((directory) => <div className="vision-inbox-directory" key={directory}><span title={directory}>{directory}</span><button type="button" onClick={() => onRemoveFolder(directory)} disabled={isBusy} aria-label={`${copy.inboxRemoveFolder}: ${directory}`} title={copy.inboxRemoveFolder}><X size={12} /></button></div>)}</div> : null}
    {progress?.status === 'scanning' ? <div className="vision-scan-progress" role="status"><span>{copy.inboxScanning}</span><span>{progress.discoveredVideos}</span></div> : null}
    {pipelineProgress ? <div className="vision-inbox-pipeline-progress" role="status"><span>{copy.inboxStatus(pipelineProgress.status)}</span><small>{items.find((item) => item.id === pipelineProgress.itemId)?.fileName ?? pipelineProgress.itemId}{pipelineProgress.message ? ` · ${pipelineProgress.message}` : pipelineProgress.progress?.message ? ` · ${pipelineProgress.progress.message}` : ''}</small></div> : null}
    {error ? <div className="vision-error" role="alert">{error}</div> : null}
    <div className="vision-inbox-filter-row"><input className="vision-inbox-meta-input" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.inboxSearchPlaceholder} aria-label={copy.inboxSearchPlaceholder} /><select className="vision-inbox-filter-select" value={status} onChange={(event) => setStatus(event.target.value as MediaImportInboxStatus | 'all')} aria-label={copy.inboxFilterAll}><option value="all">{copy.inboxFilterAll}</option><option value="discovered">{copy.inboxStatus('discovered')}</option><option value="queued">{copy.inboxStatus('queued')}</option><option value="processing">{copy.inboxStatus('processing')}</option><option value="ready">{copy.inboxStatus('ready')}</option><option value="failed">{copy.inboxStatus('failed')}</option><option value="ignored">{copy.inboxStatus('ignored')}</option><option value="missing">{copy.inboxStatus('missing')}</option></select><label className="vision-folder-option"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /><span>{copy.inboxFavorite}</span></label></div>
    <div className="vision-inbox-summary"><span>{copy.inboxCount(items.length)}</span><small>{copy.inboxVisibleCount(filteredItems.length, items.length)}</small></div>
    {selectableVisibleItems.length > 0 ? <div className="vision-inbox-batch-toolbar"><button className="vision-secondary-action" type="button" onClick={toggleAllVisible} disabled={Boolean(batchAction)}>{allVisibleSelected ? <Square size={13} /> : <CheckSquare size={13} />}{allVisibleSelected ? copy.inboxClearSelection : copy.inboxSelectAll}</button>{selectedItems.length > 0 ? <><span>{copy.inboxSelected(selectedItems.length)}</span><button className="vision-primary-action" type="button" onClick={() => void runBatch('queue')} disabled={Boolean(batchAction) || !canApplyBatch(selectedItems, 'queue')}><Database size={12} />{batchAction === 'queue' ? copy.inboxBatchSaving : copy.inboxBatchQueue}</button><button className="vision-secondary-action" type="button" onClick={() => void runBatch('ignore')} disabled={Boolean(batchAction) || !canApplyBatch(selectedItems, 'ignore')}>{copy.inboxBatchIgnore}</button><button className="vision-secondary-action" type="button" onClick={() => void runBatch('retry')} disabled={Boolean(batchAction) || !canApplyBatch(selectedItems, 'retry')}><FolderSync size={12} />{batchAction === 'retry' ? copy.inboxBatchSaving : copy.inboxBatchRetry}</button><button className="vision-secondary-action" type="button" onClick={() => void runBatch('clear')} disabled={Boolean(batchAction) || !canApplyBatch(selectedItems, 'clear')}><Trash2 size={12} />{batchAction === 'clear' ? copy.inboxBatchSaving : copy.inboxBatchClear}</button></> : null}</div> : null}
    {visibleItems.length === 0 ? <small className="vision-inbox-empty">{copy.inboxEmpty}</small> : <div className="vision-inbox-items">{visibleItems.map((item) => <article className="vision-inbox-item" key={item.id}><div className="vision-inbox-item-copy"><div className="vision-inbox-item-heading">{isBatchSelectable(item) ? <input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleSelection(item.id)} aria-label={copy.inboxSelectItem(item.fileName)} disabled={Boolean(batchAction)} /> : null}<strong title={item.path}>{item.fileName}</strong></div><span title={item.path}>{item.path}</span><small className={statusClass(item.status)}>{copy.inboxStatus(item.status)}{item.lastError ? ` · ${item.lastError}` : ''}</small><div className="vision-inbox-meta-row"><input className="vision-inbox-meta-input" defaultValue={item.metadata.tags.join(', ')} placeholder={copy.inboxTagsPlaceholder} aria-label={copy.inboxTagsPlaceholder} onBlur={(event) => onUpdateMetadata(item, { tags: event.currentTarget.value.split(',') })} /><label className="vision-folder-option"><input type="checkbox" checked={item.metadata.favorite} onChange={(event) => onUpdateMetadata(item, { favorite: event.target.checked })} /><span>{copy.inboxFavorite}</span></label></div><input className="vision-inbox-meta-input" defaultValue={item.metadata.note} placeholder={copy.inboxNotePlaceholder} aria-label={copy.inboxNotePlaceholder} onBlur={(event) => onUpdateMetadata(item, { note: event.currentTarget.value })} /><div className="vision-inbox-meta-row"><input className="vision-inbox-meta-input" defaultValue={item.metadata.source ?? ''} placeholder={copy.inboxSourcePlaceholder} aria-label={copy.inboxSourcePlaceholder} onBlur={(event) => onUpdateMetadata(item, { source: event.currentTarget.value || null })} /><input className="vision-inbox-meta-input" defaultValue={item.metadata.projectId ?? ''} placeholder={copy.inboxProjectPlaceholder} aria-label={copy.inboxProjectPlaceholder} onBlur={(event) => onUpdateMetadata(item, { projectId: event.currentTarget.value || null })} /></div></div><div className="vision-inbox-item-actions">{item.status === 'discovered' ? <><button className="vision-primary-action" type="button" onClick={() => onQueue(item)} disabled={isBusy || Boolean(batchAction)}><Database size={12} />{copy.inboxQueue}</button><button className="vision-secondary-action" type="button" onClick={() => onIgnore(item)} disabled={isBusy || Boolean(batchAction)}>{copy.inboxIgnore}</button></> : item.status === 'failed' || item.status === 'missing' ? <button className="vision-secondary-action" type="button" onClick={() => onRetry(item)} disabled={isBusy || Boolean(batchAction)}><FolderSync size={12} />{copy.inboxRetry}</button> : null}</div></article>)}</div>}
  </section>
}
