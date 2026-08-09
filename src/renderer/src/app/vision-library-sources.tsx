import { Database, Play, ScanSearch, Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { filterVisionLibrarySources, type VisionLibrarySourceSortMode } from '../../../core/ai/vision-library-source-filter'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionLibrarySource } from '../../../shared/vision-types'

type VisionLibrarySourcesProps = {
  copy: LocaleCopy['vision']
  sources: VisionLibrarySource[]
  thumbnailUrls: Record<string, string>
  hasMoreSources: boolean
  isLoadingMoreSources: boolean
  onLoadMore: () => void
  onOpenSource: (source: VisionLibrarySource) => void
}

export function VisionLibrarySources({ copy, sources, thumbnailUrls, hasMoreSources, isLoadingMoreSources, onLoadMore, onOpenSource }: VisionLibrarySourcesProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [sortMode, setSortMode] = useState<VisionLibrarySourceSortMode>('recent')
  const filteredSources = useMemo(() => filterVisionLibrarySources(sources, { query, favoriteOnly, sortMode }), [favoriteOnly, query, sortMode, sources])

  return <section className="vision-card vision-library-sources" aria-label={copy.libraryTitle}>
    <div className="vision-collections-heading"><span><Database size={14} />{copy.libraryTitle}</span><small>{copy.libraryVisibleCount(filteredSources.length, sources.length)}</small></div>
    {sources.length > 0 ? <div className="vision-library-source-filters"><label className="vision-library-source-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.librarySearchPlaceholder} aria-label={copy.librarySearchPlaceholder} /></label><select value={sortMode} onChange={(event) => setSortMode(event.target.value as VisionLibrarySourceSortMode)} aria-label={copy.librarySortLabel}><option value="recent">{copy.librarySortRecent}</option><option value="name">{copy.librarySortName}</option><option value="frames">{copy.librarySortFrames}</option></select><label className="vision-folder-option"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /><span>{copy.libraryFavoriteOnly}</span></label></div> : null}
    {sources.length === 0 ? <div className="vision-empty"><ScanSearch size={18} /><span>{copy.libraryEmpty}</span></div> : filteredSources.length === 0 ? <div className="vision-empty"><ScanSearch size={18} /><span>{copy.libraryNoMatch}</span></div> : <div className="vision-library-source-grid">{filteredSources.map((source) => <button className="vision-library-source" type="button" key={source.sourceId} onClick={() => onOpenSource(source)} title={copy.libraryOpen}>
      {source.thumbnailPath && thumbnailUrls[source.sourceId] ? <img src={thumbnailUrls[source.sourceId]} alt="" /> : <span className="vision-library-source-placeholder"><ScanSearch size={18} /></span>}
      <span className="vision-library-source-copy"><strong>{source.fileName}</strong><span title={source.videoPath}>{source.videoPath}</span><small>{copy.libraryFrameCount(source.frameCount)}</small>{source.metadata ? <span className="vision-library-source-metadata">{source.metadata.favorite ? <em><Star size={10} fill="currentColor" />{copy.libraryFavorite}</em> : null}{source.metadata.tags.map((tag) => <em key={tag}>#{tag}</em>)}{source.metadata.source ? <em>{copy.librarySource}: {source.metadata.source}</em> : null}{source.metadata.projectId ? <em>{copy.libraryProject}: {source.metadata.projectId}</em> : null}{source.metadata.note ? <em className="vision-library-source-note" title={source.metadata.note}>{source.metadata.note}</em> : null}</span> : null}</span>
      <Play size={13} aria-hidden="true" />
    </button>)}</div>}
    {hasMoreSources ? <button className="vision-secondary-action vision-library-load-more" type="button" onClick={onLoadMore} disabled={isLoadingMoreSources}>{isLoadingMoreSources ? copy.libraryLoadingMore : copy.libraryLoadMore}</button> : null}
  </section>
}
