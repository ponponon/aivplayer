import type { ReactElement } from 'react'
import { formatDetailValue, humanizeKey, type MediaProbeEntry } from './media-details-formatters'

export function MediaDetailsEntryGrid({
  entries,
  probeFieldLabels
}: {
  entries: MediaProbeEntry[]
  probeFieldLabels?: Record<string, string>
}): ReactElement {
  return (
    <div className="media-details-grid">
      {entries.map((entry) => (
        <div className="media-details-item" key={entry.key}>
          <span>{humanizeKey(entry.key, probeFieldLabels)}</span>
          <strong title={formatDetailValue(entry.value)}>{formatDetailValue(entry.value)}</strong>
        </div>
      ))}
    </div>
  )
}
