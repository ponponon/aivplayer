import { ScanSearch } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionSearchResult } from '../../../shared/vision-types'

type VisionSearchResultsProps = {
  copy: LocaleCopy['vision']
  results: VisionSearchResult[]
  thumbnailUrls: Record<string, string>
  onOpenResult: (result: VisionSearchResult) => void
  selectedIds: ReadonlySet<string>
  onToggleSelection: (result: VisionSearchResult) => void
}

export function VisionSearchResults({ copy, results, thumbnailUrls, onOpenResult, selectedIds, onToggleSelection }: VisionSearchResultsProps): React.ReactElement {
  return <section className="vision-results" aria-live="polite">
    {results.length === 0 ? <div className="vision-empty">{copy.noResults}</div> : results.map((result) => {
      const selected = selectedIds.has(result.id)
      return <div className={`vision-result-row ${selected ? 'is-selected' : ''}`} key={result.id}>
        <label className="vision-result-select" title={copy.selectResult}>
          <input type="checkbox" checked={selected} onChange={() => onToggleSelection(result)} aria-label={copy.selectResult} />
        </label>
        <button className="vision-result" type="button" onClick={() => onOpenResult(result)} title={copy.clickResult}>
          {thumbnailUrls[result.id] ? <img src={thumbnailUrls[result.id]} alt="" /> : <span className="vision-result-placeholder"><ScanSearch size={18} /></span>}
          <span className="vision-result-copy"><strong>{result.fileName}</strong><span>{formatTimestamp(result.startSeconds ?? result.timestampSeconds)} · {copy.score(result.score)}</span>{result.matchedText ? <span className="vision-result-match">{result.matchedText}</span> : null}</span>
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
