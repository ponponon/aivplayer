import { Boxes, X } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionObjectDetectionResult } from '../../../shared/vision-object-detection-types'
import { VisionResultThumbnail } from './vision-result-thumbnail'

type VisionObjectDetectionResultProps = {
  copy: LocaleCopy['vision']
  result: VisionObjectDetectionResult
  thumbnailUrl?: string | null
  onClear: () => void
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`
}

function formatBox(result: VisionObjectDetectionResult['detections'][number]): string {
  const { xmin, ymin, xmax, ymax } = result.box
  return `[${Math.round(xmin)}, ${Math.round(ymin)}]–[${Math.round(xmax)}, ${Math.round(ymax)}]`
}

export function VisionObjectDetectionResultView({ copy, result, thumbnailUrl, onClear }: VisionObjectDetectionResultProps): React.ReactElement {
  return (
    <section className="vision-card vision-object-detection-result" data-testid="vision-object-detection-result">
      <div className="vision-object-detection-heading">
        <div className="vision-collections-heading"><Boxes size={15} /><strong>{copy.objectDetectionTitle}</strong></div>
        <button className="vision-collection-delete" type="button" onClick={onClear} title={copy.objectDetectionClear} aria-label={copy.objectDetectionClear}><X size={14} /></button>
      </div>
      {thumbnailUrl ? <div className="vision-object-detection-preview"><VisionResultThumbnail src={thumbnailUrl} alt="" boxes={result.detections.map((detection) => detection.box)} /></div> : null}
      <p className="vision-object-detection-summary">{copy.objectDetectionCount(result.detections.length)} · {copy.objectDetectionThreshold(formatScore(result.threshold))}</p>
      {result.detections.length === 0 ? <p className="vision-object-detection-empty">{copy.objectDetectionEmpty}</p> : (
        <ul className="vision-object-detection-list">
          {result.detections.map((detection, index) => (
            <li key={`${detection.label}-${index}`}>
              <strong>{detection.label}</strong>
              <span>{copy.objectDetectionScore(formatScore(detection.score))}</span>
              <span>{copy.objectDetectionBox(formatBox(detection))}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
