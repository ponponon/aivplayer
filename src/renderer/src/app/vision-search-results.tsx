import { ScanSearch } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionSearchResult, VisionSearchSortMode } from '../../../shared/vision-types'
import { sortVisionSearchResults } from '../../../core/ai/vision-search'

type VisionSearchResultsProps = {
  copy: LocaleCopy['vision']
  results: VisionSearchResult[]
  thumbnailUrls: Record<string, string>
  onOpenResult: (result: VisionSearchResult) => void
  selectedIds: ReadonlySet<string>
  onToggleSelection: (result: VisionSearchResult) => void
  sortMode: VisionSearchSortMode
  onSortModeChange: (sortMode: VisionSearchSortMode) => void
}

export function VisionSearchResults({ copy, results, thumbnailUrls, onOpenResult, selectedIds, onToggleSelection, sortMode, onSortModeChange }: VisionSearchResultsProps): React.ReactElement {
  const sortedResults = sortVisionSearchResults(results, sortMode)
  return <section className="vision-results" aria-live="polite">
    <div className="vision-results-toolbar">
      <span>{copy.searchSortLabel}</span>
      <select value={sortMode} aria-label={copy.searchSortLabel} onChange={(event) => onSortModeChange(event.target.value as VisionSearchSortMode)}>
        <option value="relevance">{copy.searchSortRelevance}</option>
        <option value="source-time">{copy.searchSortSourceTime}</option>
        <option value="file-name">{copy.searchSortFileName}</option>
      </select>
    </div>
    {sortedResults.length === 0 ? <div className="vision-empty">{copy.noResults}</div> : sortedResults.map((result) => {
      const selected = selectedIds.has(result.id)
      return <div className={`vision-result-row ${selected ? 'is-selected' : ''}`} key={result.id}>
        <label className="vision-result-select" title={copy.selectResult}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelection(result)} aria-label={copy.selectResult} />
        </label>
        <button className="vision-result" type="button" data-evidence-id={result.evidenceId ?? result.id} data-evidence-type={result.evidenceType ?? 'visual'} onClick={() => onOpenResult(result)} title={copy.clickResult}>
          {thumbnailUrls[result.id] ? <img src={thumbnailUrls[result.id]} alt="" /> : <span className="vision-result-placeholder"><ScanSearch size={18} /></span>}
          <span className="vision-result-copy"><strong>{result.fileName}</strong><span>{result.evidenceType === 'ocr' ? `${copy.ocrResultLabel} · ` : ''}{formatEvidenceRange(result)} · {copy.score(result.score)}</span>{result.matchedText ? <span className="vision-result-match">{result.matchedText}</span> : null}</span>
        </button>
      </div>
    })}
  </section>
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}

function formatEvidenceRange(result: VisionSearchResult): string {
  const start = result.startSeconds
  const end = result.endSeconds
  const format = result.evidenceType === 'ocr' ? formatPreciseTimestamp : formatTimestamp
  if (start !== undefined && end !== undefined && Number.isFinite(start) && Number.isFinite(end) && end > start) {
    return `${format(start)}–${format(end)}`
  }
  return format(result.timestampSeconds)
}

function formatPreciseTimestamp(seconds: number): string {
  return `${Math.max(0, seconds).toFixed(1)}s`
}
