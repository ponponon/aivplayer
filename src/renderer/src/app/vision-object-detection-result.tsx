import { Boxes, X } from 'lucide-react'
import { useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionObjectDetectionResult } from '../../../shared/vision-object-detection-types'
import { toggleVisionObjectDetectionSelection } from '../../../core/ai/vision-object-detection-selection'
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
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const highlightedIndex = hoveredIndex ?? selectedIndex

  return (
    <section className="vision-card vision-object-detection-result" data-testid="vision-object-detection-result">
      <div className="vision-object-detection-heading">
        <div className="vision-collections-heading"><Boxes size={15} /><strong>{copy.objectDetectionTitle}</strong></div>
        <button className="vision-collection-delete" type="button" onClick={onClear} title={copy.objectDetectionClear} aria-label={copy.objectDetectionClear}><X size={14} /></button>
      </div>
      {thumbnailUrl ? <div className="vision-object-detection-preview"><VisionResultThumbnail src={thumbnailUrl} alt="" boxes={result.detections.map((detection) => detection.box)} highlightedBoxIndex={highlightedIndex} /></div> : null}
      <p className="vision-object-detection-summary">{copy.objectDetectionCount(result.detections.length)} · {copy.objectDetectionThreshold(formatScore(result.threshold))}</p>
      {result.detections.length === 0 ? <p className="vision-object-detection-empty">{copy.objectDetectionEmpty}</p> : (
        <ul className="vision-object-detection-list">
          {result.detections.map((detection, index) => {
            const isSelected = selectedIndex === index
            return <li key={`${detection.label}-${index}`}>
              <button
                className={`vision-object-detection-candidate${isSelected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={isSelected}
                data-testid={`vision-object-detection-candidate-${index}`}
                onClick={() => setSelectedIndex((current) => toggleVisionObjectDetectionSelection(current, index, result.detections.length))}
                onMouseEnter={() => setHoveredIndex(index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onFocus={() => setHoveredIndex(index)}
                onBlur={() => setHoveredIndex(null)}
              >
                <strong>{detection.label}</strong>
                <span>{copy.objectDetectionScore(formatScore(detection.score))}</span>
                <span>{copy.objectDetectionBox(formatBox(detection))}</span>
              </button>
            </li>
          })}
        </ul>
      )}
    </section>
  )
}
