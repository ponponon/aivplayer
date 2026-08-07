import type { MediaStructureAnalysisResult, MediaStructureSegment } from '../../../shared/media-types'
import { ScanSearch } from 'lucide-react'
import { getEditingStructureCopy } from '../../../shared/editing-structure-copy'
import { formatTime } from '../lib/time'

type Props = {
  analysis: MediaStructureAnalysisResult | null
  isAnalyzing: boolean
  copy: ReturnType<typeof getEditingStructureCopy>
  onAnalyze: () => void
  onSeek: (segment: MediaStructureSegment) => void
}

export function EditingStructureAnalysis({ analysis, isAnalyzing, copy, onAnalyze, onSeek }: Props): React.ReactElement {
  return <details className="editing-structure-analysis" data-testid="editing-structure-analysis">
    <summary className="editing-structure-summary"><ScanSearch size={14} aria-hidden="true" /><span>{copy.title}</span>{analysis?.cacheHit ? <small>{copy.cached}</small> : null}</summary>
    <div className="editing-structure-panel">
      <button className="editing-structure-analyze" type="button" onClick={onAnalyze} disabled={isAnalyzing}>{isAnalyzing ? copy.analyzing : copy.analyze}</button>
      {analysis?.success ? analysis.segments.length > 0 ? <div className="editing-structure-list">{analysis.segments.map((segment) => <button className="editing-structure-item" key={segment.id} type="button" onClick={() => onSeek(segment)} title={`${copy.jump}: ${formatTime(segment.startSeconds)}`}><span><strong>{copy.kindLabels[segment.kind]}</strong><small>{formatTime(segment.startSeconds)} – {formatTime(segment.endSeconds)} · {copy.confidence(segment.confidence)}</small></span><em>{copy.jump}</em></button>)}</div> : <p className="editing-structure-empty">{copy.noSegments}</p> : null}
    </div>
  </details>
}
