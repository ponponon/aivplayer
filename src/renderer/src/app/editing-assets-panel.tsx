import { Check, Search, Video, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { EditingSource } from '../../../shared/editing-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { MediaFile } from '../../../shared/media-types'
import { formatTime } from '../lib/time'
import { writeEditingSourceDrag } from './editing-asset-dnd'
import { useModalFocusTrap } from './use-modal-focus-trap'
import type { EditingFilmstripFrame } from './use-editing-filmstrip'

type AssetFilter = 'all' | 'used' | 'unused'

type Props = {
  sources: readonly EditingSource[]
  sourceFiles: Record<string, MediaFile>
  filmstrips: Record<string, readonly EditingFilmstripFrame[]>
  usedSourceIds: readonly string[]
  copy: LocaleCopy['editing']
  onInsertMain: (sourceId: string) => void
  onAppendMain: (sourceIds: readonly string[]) => void
  onInsertOverlay: (sourceId: string) => void
}

export function EditingAssetsPanel({ sources, sourceFiles, filmstrips, usedSourceIds, copy, onInsertMain, onAppendMain, onInsertOverlay }: Props): React.ReactElement {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<AssetFilter>('all')
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => new Set())
  const [previewSourceId, setPreviewSourceId] = useState<string | null>(null)
  const previewDialogRef = useRef<HTMLElement | null>(null)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const usedIds = useMemo(() => new Set(usedSourceIds), [usedSourceIds])
  useEffect(() => {
    const sourceIds = new Set(sources.map((source) => source.id))
    setSelectedSourceIds((current) => {
      const next = new Set([...current].filter((sourceId) => sourceIds.has(sourceId)))
      return next.size === current.size ? current : next
    })
  }, [sources])
  const visibleSources = useMemo(() => sources.filter((source) => {
    const isUsed = usedIds.has(source.id)
    if (filter === 'used' && !isUsed) return false
    if (filter === 'unused' && isUsed) return false
    if (!normalizedQuery) return true
    const file = sourceFiles[source.id]
    return `${source.name} ${file?.path ?? source.path}`.toLocaleLowerCase().includes(normalizedQuery)
  }), [filter, normalizedQuery, sourceFiles, sources, usedIds])
  const previewSource = previewSourceId ? sources.find((source) => source.id === previewSourceId) ?? null : null
  const previewFile = previewSource ? sourceFiles[previewSource.id] : null
  const previewFrames = previewSource ? filmstrips[previewSource.id] ?? [] : []
  useModalFocusTrap(Boolean(previewSource), previewDialogRef, '.editing-asset-preview-close')
  useEffect(() => {
    if (!previewSource) return
    const handleKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') setPreviewSourceId(null) }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [previewSource])
  const toggleSourceSelection = (sourceId: string): void => {
    setSelectedSourceIds((current) => {
      const next = new Set(current)
      if (next.has(sourceId)) next.delete(sourceId)
      else next.add(sourceId)
      return next
    })
  }
  const appendSelectedSources = (): void => {
    if (selectedSourceIds.size === 0) return
    onAppendMain(sources.filter((source) => selectedSourceIds.has(source.id)).map((source) => source.id))
    setSelectedSourceIds(new Set())
  }

  return (
    <section className="editing-assets-panel" data-testid="editing-assets-panel" aria-label={copy.assetLibrary}>
      <div className="editing-assets-header">
        <div className="editing-assets-heading">
          <span>{copy.assetLibrary}</span>
          <small>{copy.assetCount(sources.length)}</small>
        </div>
        <label className="editing-assets-search">
          <Search size={13} aria-hidden="true" />
          <input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.assetSearch} aria-label={copy.assetSearch} data-testid="editing-assets-search" />
        </label>
      </div>
      <div className="editing-assets-toolbar">
        <div className="editing-assets-filters" role="tablist" aria-label={copy.assetLibrary}>
          {(['all', 'used', 'unused'] as const).map((value) => (
            <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>
              {copy[value === 'all' ? 'assetFilterAll' : value === 'used' ? 'assetFilterUsed' : 'assetFilterUnused']}
            </button>
          ))}
        </div>
        {selectedSourceIds.size > 0 ? <div className="editing-assets-selection-actions"><span>{copy.assetSelected(selectedSourceIds.size)}</span><button type="button" className="is-primary" onClick={appendSelectedSources} data-testid="editing-assets-append-selected">{copy.assetAppendMain(selectedSourceIds.size)}</button><button type="button" onClick={() => setSelectedSourceIds(new Set())}>{copy.assetClearSelection}</button></div> : null}
      </div>
      {visibleSources.length > 0 ? (
        <div className="editing-assets-list" data-testid="editing-assets-list">
          {visibleSources.map((source) => {
            const file = sourceFiles[source.id]
            const resolution = source.width && source.height ? `${source.width}×${source.height}` : copy.assetVideo
            const frames = (filmstrips[source.id] ?? []).slice(0, 8)
            const selected = selectedSourceIds.has(source.id)
            return (
              <article className={`editing-asset-card ${selected ? 'is-selected' : ''}`} key={source.id} draggable onDragStart={(event) => writeEditingSourceDrag(event, source.id)} data-testid={`editing-asset-${source.id}`}>
                <button type="button" className="editing-asset-select" aria-label={`${copy.assetSelect}: ${source.name}`} aria-pressed={selected} onClick={() => toggleSourceSelection(source.id)}>{selected ? <Check size={12} /> : null}</button>
                <button type="button" className="editing-asset-thumb" onClick={() => setPreviewSourceId(source.id)} title={`${copy.assetPreview}: ${source.name}`} aria-label={`${copy.assetPreview}: ${source.name}`} data-testid={`editing-asset-preview-${source.id}`}>{frames.length > 0 ? <div className="editing-asset-filmstrip" aria-hidden="true">{frames.map((frame) => <img key={`${source.id}-${frame.sourceSeconds}`} src={frame.url} alt="" />)}</div> : <Video size={18} aria-hidden="true" />}<span>{formatTime(source.durationSeconds)}</span></button>
                <div className="editing-asset-copy">
                  <strong title={source.name}>{source.name}</strong>
                  <small>{resolution} · {file?.extension?.toUpperCase() || copy.assetVideo}</small>
                </div>
                <div className="editing-asset-actions">
                  <button type="button" onClick={() => onInsertMain(source.id)} title={copy.assetInsertMain} aria-label={`${copy.assetInsertMain}: ${source.name}`} data-testid={`editing-asset-main-${source.id}`}>{copy.assetInsertMain}</button>
                  <button type="button" onClick={() => onInsertOverlay(source.id)} title={copy.assetInsertOverlay} aria-label={`${copy.assetInsertOverlay}: ${source.name}`} data-testid={`editing-asset-overlay-${source.id}`}>{copy.assetInsertOverlay}</button>
                </div>
              </article>
            )
          })}
        </div>
      ) : <p className="editing-assets-empty">{sources.length > 0 ? copy.assetNoMatch : copy.assetEmpty}</p>}
      <p className="editing-assets-hint">{copy.assetDragHint}</p>
      {previewSource ? <div className="modal-backdrop editing-asset-preview-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && setPreviewSourceId(null)}><section ref={previewDialogRef} className="editing-asset-preview-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="editing-asset-preview-title" data-testid="editing-asset-preview-dialog"><div className="download-dialog-header"><div><span className="panel-kicker">{copy.assetLibrary}</span><h2 id="editing-asset-preview-title">{previewSource.name}</h2></div><button className="mini-tool-button editing-asset-preview-close" type="button" onClick={() => setPreviewSourceId(null)} title={copy.close}><X size={14} /></button></div><div className="editing-asset-preview-frame media-preview-frame">{previewFile ? <video className="editing-asset-preview-video media-preview-content" src={previewFile.url} poster={previewFrames[0]?.url} controls preload="metadata" playsInline data-testid="editing-asset-preview-video" /> : previewFrames[0] ? <img className="editing-asset-preview-image media-preview-content" src={previewFrames[0].url} alt={previewSource.name} /> : <Video size={32} aria-hidden="true" />}</div><div className="editing-asset-preview-meta"><span>{formatTime(previewSource.durationSeconds)}</span><span>{previewSource.width && previewSource.height ? `${previewSource.width}×${previewSource.height}` : copy.assetVideo}</span></div></section></div> : null}
    </section>
  )
}
