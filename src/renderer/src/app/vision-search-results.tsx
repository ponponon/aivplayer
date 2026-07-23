import { ScanSearch } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionSearchResult } from '../../../shared/vision-types'

type VisionSearchResultsProps = {
  copy: LocaleCopy['vision']
  results: VisionSearchResult[]
  thumbnailUrls: Record<string, string>
  onOpenResult: (result: VisionSearchResult) => void
}

export function VisionSearchResults({ copy, results, thumbnailUrls, onOpenResult }: VisionSearchResultsProps): React.ReactElement {
  return <section className="vision-results" aria-live="polite">
    {results.length === 0 ? <div className="vision-empty">{copy.noResults}</div> : results.map((result) => <button className="vision-result" key={result.id} type="button" onClick={() => onOpenResult(result)} title={copy.clickResult}>
      {thumbnailUrls[result.id] ? <img src={thumbnailUrls[result.id]} alt="" /> : <span className="vision-result-placeholder"><ScanSearch size={18} /></span>}
      <span className="vision-result-copy"><strong>{result.fileName}</strong><span>{formatTimestamp(result.timestampSeconds)} · {copy.score(result.score)}</span>{result.matchedText ? <span className="vision-result-match">{result.matchedText}</span> : null}</span>
    </button>)}
  </section>
}

function formatTimestamp(seconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(seconds))
  const minutes = Math.floor(totalSeconds / 60)
  const remainder = String(totalSeconds % 60).padStart(2, '0')
  return `${minutes}:${remainder}`
}
