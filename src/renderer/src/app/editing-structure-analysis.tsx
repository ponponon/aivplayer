import type { MediaStructureAnalysisResult, MediaStructureSegment } from '../../../shared/media-types'
import { ScanSearch } from 'lucide-react'
import { getEditingStructureCopy } from '../../../shared/editing-structure-copy'
import { formatTime } from '../lib/time'

type Props = {
  analysis: MediaStructureAnalysisResult | null
  isAnalyzing: boolean
  copy: ReturnType<typeof getEditingStructureCopy>
  ignoredSegmentIds: ReadonlySet<string>
  onAnalyze: () => void
  onSeek: (segment: MediaStructureSegment) => void
  onIgnore: (segment: MediaStructureSegment) => void
  onRestore: (segment: MediaStructureSegment) => void
}

export function EditingStructureAnalysis({ analysis, isAnalyzing, copy, ignoredSegmentIds, onAnalyze, onSeek, onIgnore, onRestore }: Props): React.ReactElement {
  return <details className="editing-structure-analysis" data-testid="editing-structure-analysis">
    <summary className="editing-structure-summary"><ScanSearch size={14} aria-hidden="true" /><span>{copy.title}</span>{analysis?.cacheHit ? <small>{copy.cached}</small> : null}</summary>
    <div className="editing-structure-panel">
      <button className="editing-structure-analyze" type="button" onClick={onAnalyze} disabled={isAnalyzing}>{isAnalyzing ? copy.analyzing : copy.analyze}</button>
      {analysis?.success ? analysis.segments.length > 0 ? <div className="editing-structure-list">{analysis.segments.map((segment) => {
        const ignored = ignoredSegmentIds.has(segment.id)
        return <div className={`editing-structure-item ${ignored ? 'is-ignored' : ''}`} key={segment.id} data-segment-id={segment.id}>
          <button className="editing-structure-item-main" type="button" onClick={() => onSeek(segment)} title={`${copy.jump}: ${formatTime(segment.startSeconds)}`}>
            <span><strong>{copy.kindLabels[segment.kind]}</strong><small>{formatTime(segment.startSeconds)} – {formatTime(segment.endSeconds)} · {copy.confidence(segment.confidence)}{ignored ? ` · ${copy.ignored}` : ''}</small></span>
            <em>{ignored ? copy.ignored : copy.jump}</em>
          </button>
          <button className="editing-structure-item-action" type="button" onClick={() => ignored ? onRestore(segment) : onIgnore(segment)} aria-label={`${ignored ? copy.restore : copy.ignore}: ${copy.kindLabels[segment.kind]}`} title={ignored ? copy.restore : copy.ignore}>{ignored ? copy.restore : copy.ignore}</button>
        </div>
      })}</div> : <p className="editing-structure-empty">{copy.noSegments}</p> : null}
    </div>
  </details>
}
