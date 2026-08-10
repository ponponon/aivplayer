import { Boxes, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionObjectDetectionFilterState, VisionObjectDetectionResult } from '../../../shared/vision-object-detection-types'
import { filterVisionObjectDetectionCandidates, toggleVisionObjectDetectionCategoryFilter } from '../../../core/ai/vision-object-detection-filter'
import { summarizeVisionObjectDetectionCandidates } from '../../../core/ai/vision-object-detection-summary'
import { toggleVisionObjectDetectionSelection } from '../../../core/ai/vision-object-detection-selection'
import { VisionResultThumbnail } from './vision-result-thumbnail'

type VisionObjectDetectionResultProps = {
  copy: LocaleCopy['vision']
  result: VisionObjectDetectionResult
  thumbnailUrl?: string | null
  filter: VisionObjectDetectionFilterState
  onFilterChange: (filter: VisionObjectDetectionFilterState) => void
  onClear: () => void
}

function formatScore(score: number): string {
  return `${Math.round(score * 100)}%`
}

function formatBox(result: VisionObjectDetectionResult['detections'][number]): string {
  const { xmin, ymin, xmax, ymax } = result.box
  return `[${Math.round(xmin)}, ${Math.round(ymin)}]–[${Math.round(xmax)}, ${Math.round(ymax)}]`
}

export function VisionObjectDetectionResultView({ copy, result, thumbnailUrl, filter, onFilterChange, onClear }: VisionObjectDetectionResultProps): React.ReactElement {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null)
  const { labelQuery, minimumScore, categoryLabels } = filter
  const baseFilter = { labelQuery, minimumScore }
  const facetedDetections = filterVisionObjectDetectionCandidates(result.detections, baseFilter)
  const visibleDetections = filterVisionObjectDetectionCandidates(result.detections, { ...baseFilter, categoryLabels })
  const categories = summarizeVisionObjectDetectionCandidates(facetedDetections)
  const safeSelectedIndex = selectedIndex !== null && selectedIndex < visibleDetections.length ? selectedIndex : null
  const highlightedIndex = hoveredIndex ?? safeSelectedIndex

  useEffect(() => {
    setHoveredIndex(null)
    setSelectedIndex(null)
  }, [labelQuery, minimumScore, categoryLabels])

  return (
    <section className="vision-card vision-object-detection-result" data-testid="vision-object-detection-result">
      <div className="vision-object-detection-heading">
        <div className="vision-collections-heading"><Boxes size={15} /><strong>{copy.objectDetectionTitle}</strong></div>
        <button className="vision-collection-delete" type="button" onClick={onClear} title={copy.objectDetectionClear} aria-label={copy.objectDetectionClear}><X size={14} /></button>
      </div>
      {thumbnailUrl ? <div className="vision-object-detection-preview"><VisionResultThumbnail src={thumbnailUrl} alt="" boxes={visibleDetections.map((detection) => detection.box)} highlightedBoxIndex={highlightedIndex} /></div> : null}
      <p className="vision-object-detection-summary">{copy.objectDetectionCount(result.detections.length)} · {copy.objectDetectionVisibleCount(visibleDetections.length, result.detections.length)} · {copy.objectDetectionThreshold(formatScore(result.threshold))}</p>
      <div className="vision-object-detection-filters">
        <label>
          <span>{copy.objectDetectionLabelFilter}</span>
          <input type="search" value={labelQuery} onChange={(event) => onFilterChange({ ...filter, labelQuery: event.target.value })} placeholder={copy.objectDetectionLabelFilterPlaceholder} aria-label={copy.objectDetectionLabelFilter} />
        </label>
        <label>
          <span>{copy.objectDetectionMinimumScore}</span>
          <select value={minimumScore} onChange={(event) => onFilterChange({ ...filter, minimumScore: Number(event.target.value) })} aria-label={copy.objectDetectionMinimumScore}>
            <option value={0}>{copy.objectDetectionAnyScore}</option>
            <option value={0.5}>{formatScore(0.5)}</option>
            <option value={0.75}>{formatScore(0.75)}</option>
            <option value={0.9}>{formatScore(0.9)}</option>
          </select>
        </label>
      </div>
      {categories.length > 0 ? <div className="vision-object-detection-categories">
        <span className="vision-object-detection-categories-label">{copy.objectDetectionCategories}</span>
        <div className="vision-object-detection-category-list">
          {categories.map((category) => {
            const isActive = categoryLabels.some((selectedLabel) => selectedLabel.toLocaleLowerCase() === category.label.toLocaleLowerCase())
            return <button
              className={`vision-object-detection-category${isActive ? ' is-active' : ''}`}
              type="button"
              key={category.label.toLocaleLowerCase()}
              aria-pressed={isActive}
              title={category.label}
              onClick={() => onFilterChange({ ...filter, categoryLabels: toggleVisionObjectDetectionCategoryFilter(categoryLabels, category.label) })}
            >
              <span>{category.label}</span>
              <strong>{category.count}</strong>
            </button>
          })}
        </div>
      </div> : null}
      {visibleDetections.length === 0 ? <p className="vision-object-detection-empty">{result.detections.length === 0 ? copy.objectDetectionEmpty : copy.objectDetectionNoMatches}</p> : (
        <ul className="vision-object-detection-list">
          {visibleDetections.map((detection, index) => {
            const isSelected = selectedIndex === index
            return <li key={`${detection.label}-${index}`}>
              <button
                className={`vision-object-detection-candidate${isSelected ? ' is-selected' : ''}`}
                type="button"
                aria-pressed={isSelected}
                data-testid={`vision-object-detection-candidate-${index}`}
                onClick={() => setSelectedIndex((current) => toggleVisionObjectDetectionSelection(current, index, visibleDetections.length))}
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
