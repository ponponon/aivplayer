import { AppSelect } from '../../../shared/app-select'
import { Copy, Database, Play, ScanSearch, Search, Star } from 'lucide-react'
import { useMemo, useState } from 'react'
import { filterVisionLibrarySources, type VisionLibrarySourceSortMode } from '../../../core/ai/vision-library-source-filter'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionDuplicateMediaScanResult, VisionLibrarySource } from '../../../shared/vision-types'

type VisionLibrarySourcesProps = {
  copy: LocaleCopy['vision']
  sources: VisionLibrarySource[]
  thumbnailUrls: Record<string, string>
  hasMoreSources: boolean
  isLoadingMoreSources: boolean
  onLoadMore: () => void
  onOpenSource: (source: VisionLibrarySource) => void
  duplicateScan: VisionDuplicateMediaScanResult | null
  isScanningDuplicates: boolean
  duplicateThumbnailUrls: Record<string, string>
  onScanDuplicates: () => void
}

function formatDuplicateBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  const unitIndex = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)))
  const value = bytes / 1024 ** unitIndex
  return `${value >= 10 || unitIndex === 0 ? Math.round(value) : value.toFixed(1)} ${units[unitIndex]}`
}

export function VisionLibrarySources({ copy, sources, thumbnailUrls, hasMoreSources, isLoadingMoreSources, onLoadMore, onOpenSource, duplicateScan, isScanningDuplicates, duplicateThumbnailUrls, onScanDuplicates }: VisionLibrarySourcesProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [favoriteOnly, setFavoriteOnly] = useState(false)
  const [sortMode, setSortMode] = useState<VisionLibrarySourceSortMode>('recent')
  const filteredSources = useMemo(() => filterVisionLibrarySources(sources, { query, favoriteOnly, sortMode }), [favoriteOnly, query, sortMode, sources])

  return <section className="vision-card vision-library-sources" aria-label={copy.libraryTitle}>
    <div className="vision-collections-heading"><span><Database size={14} />{copy.libraryTitle}</span><div className="vision-library-heading-actions"><small>{copy.libraryVisibleCount(filteredSources.length, sources.length)}</small><button className="vision-secondary-action" type="button" data-testid="vision-duplicate-scan" onClick={onScanDuplicates} disabled={isScanningDuplicates} title={copy.libraryDuplicateDescription}><Copy size={12} />{isScanningDuplicates ? copy.libraryDuplicateScanning : copy.libraryDuplicateScan}</button></div></div>
    {sources.length > 0 ? <div className="vision-library-source-filters"><label className="vision-library-source-search"><Search size={13} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={copy.librarySearchPlaceholder} aria-label={copy.librarySearchPlaceholder} /></label><AppSelect value={sortMode} onChange={(event) => setSortMode(event.target.value as VisionLibrarySourceSortMode)} aria-label={copy.librarySortLabel}><option value="recent">{copy.librarySortRecent}</option><option value="name">{copy.librarySortName}</option><option value="frames">{copy.librarySortFrames}</option></AppSelect><label className="vision-folder-option"><input type="checkbox" checked={favoriteOnly} onChange={(event) => setFavoriteOnly(event.target.checked)} /><span>{copy.libraryFavoriteOnly}</span></label></div> : null}
    {sources.length === 0 ? <div className="vision-empty"><ScanSearch size={18} /><span>{copy.libraryEmpty}</span></div> : filteredSources.length === 0 ? <div className="vision-empty"><ScanSearch size={18} /><span>{copy.libraryNoMatch}</span></div> : <div className="vision-library-source-grid">{filteredSources.map((source) => <button className="vision-library-source" type="button" key={source.sourceId} onClick={() => onOpenSource(source)} title={copy.libraryOpen}>
      {source.thumbnailPath && thumbnailUrls[source.sourceId] ? <img src={thumbnailUrls[source.sourceId]} alt="" /> : <span className="vision-library-source-placeholder"><ScanSearch size={18} /></span>}
      <span className="vision-library-source-copy"><strong>{source.fileName}</strong><span title={source.videoPath}>{source.videoPath}</span><small>{copy.libraryFrameCount(source.frameCount)}</small>{source.metadata ? <span className="vision-library-source-metadata">{source.metadata.favorite ? <em><Star size={10} fill="currentColor" />{copy.libraryFavorite}</em> : null}{source.metadata.tags.map((tag) => <em key={tag}>#{tag}</em>)}{source.metadata.source ? <em>{copy.librarySource}: {source.metadata.source}</em> : null}{source.metadata.projectId ? <em>{copy.libraryProject}: {source.metadata.projectId}</em> : null}{source.metadata.note ? <em className="vision-library-source-note" title={source.metadata.note}>{source.metadata.note}</em> : null}</span> : null}</span>
      <Play size={13} aria-hidden="true" />
    </button>)}</div>}
    {duplicateScan ? <div className="vision-library-duplicate-report" data-testid="vision-duplicate-report" role="status" aria-label={copy.libraryDuplicateTitle}>
      <div className="vision-library-duplicate-heading"><div><strong>{copy.libraryDuplicateTitle}</strong><small>{copy.libraryDuplicateDescription}</small></div><small>{copy.libraryDuplicateSummary(duplicateScan.groups.length, duplicateScan.groups.reduce((total, group) => total + group.sources.length, 0), duplicateScan.hashedCount, duplicateScan.cachedCount, duplicateScan.skippedBySizeCount)}</small></div>
      {duplicateScan.unavailableCount > 0 ? <small className="vision-library-duplicate-warning">{copy.libraryDuplicateUnavailable(duplicateScan.unavailableCount)}</small> : null}
      {duplicateScan.groups.length === 0 ? <div className="vision-empty"><ScanSearch size={16} /><span>{copy.libraryDuplicateEmpty}</span></div> : <div className="vision-library-duplicate-groups" role="list">
        {duplicateScan.groups.map((group) => <div className="vision-library-duplicate-group" key={group.id} role="listitem">
          <div className="vision-library-duplicate-group-heading"><strong>{copy.libraryDuplicateGroup(group.sources.length)}</strong><small>{copy.libraryDuplicateSavings(formatDuplicateBytes(group.duplicateBytes))}</small></div>
          <div className="vision-library-duplicate-sources">
            {group.sources.map((source) => <button className="vision-library-duplicate-source" type="button" key={source.sourceId} onClick={() => onOpenSource(source)} title={copy.libraryOpen}>
              {source.thumbnailPath && duplicateThumbnailUrls[source.sourceId] ? <img src={duplicateThumbnailUrls[source.sourceId]} alt="" /> : <span className="vision-library-source-placeholder"><ScanSearch size={16} /></span>}
              <span><strong>{source.fileName}</strong><small title={source.videoPath}>{source.videoPath}</small></span>
            </button>)}
          </div>
        </div>)}
      </div>}
    </div> : null}
    {hasMoreSources ? <button className="vision-secondary-action vision-library-load-more" type="button" onClick={onLoadMore} disabled={isLoadingMoreSources}>{isLoadingMoreSources ? copy.libraryLoadingMore : copy.libraryLoadMore}</button> : null}
  </section>
}
