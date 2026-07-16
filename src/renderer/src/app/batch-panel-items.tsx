import { Check } from 'lucide-react'
import type { ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { BatchSubtitleJob } from '../../../shared/media-types'

export function BatchPanelItems({
  copy,
  job,
  formatElapsed,
  getItemStatusLabel
}: {
  copy: LocaleCopy
  job: BatchSubtitleJob | null
  formatElapsed: (value: number | undefined) => string | null
  getItemStatusLabel: (item: BatchSubtitleJob['items'][number]) => string
}): ReactElement {
  return (
    <>
      {job ? (
        <div className="batch-task-list">
          {job.items.map((item) => {
            const elapsed = formatElapsed(item.elapsedMs)
            return (
              <div className={`batch-task-item ${item.status}`} key={item.id}>
                <span className="batch-task-icon">{item.status === 'completed' ? <Check size={13} /> : item.status === 'failed' ? '!' : item.status === 'cancelled' ? '×' : item.status === 'asr' || item.status === 'translating' || item.status === 'retrying' ? '…' : '·'}</span>
                <span className="batch-task-name" title={item.file.path}>{item.file.name}</span>
                <span className="batch-task-status">{getItemStatusLabel(item)}</span>
                {elapsed ? <span className="batch-task-time">{elapsed}</span> : null}
                {item.error ? (
                  <details className="batch-task-error-details">
                    <summary className="batch-task-error" title={item.error}>!</summary>
                    <div className="batch-error-popover">
                      <strong>{copy.batchSubtitle.errorDetails}</strong>
                      <p>{item.error}</p>
                      {item.errorDetails?.status ? <span>HTTP {item.errorDetails.status} {item.errorDetails.statusText ?? ''}</span> : null}
                      {item.errorDetails?.responseBody ? <pre>{item.errorDetails.responseBody}</pre> : null}
                    </div>
                  </details>
                ) : null}
              </div>
            )
          })}
        </div>
      ) : null}
    </>
  )
}
