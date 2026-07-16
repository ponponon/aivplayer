import { RefreshCcw } from 'lucide-react'
import type { ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { BatchSubtitleJob } from '../../../shared/media-types'

export function BatchPanelHistory({
  copy,
  history,
  isLoading,
  notice,
  activeJob,
  onRefresh,
  onRetry,
  getJobStatusLabel,
  formatElapsed,
  formatTimestamp,
  getFailureCategory
}: {
  copy: LocaleCopy
  history: BatchSubtitleJob[]
  isLoading: boolean
  notice: string | null
  activeJob: boolean
  onRefresh: () => void
  onRetry: (jobId: string, retryableOnly: boolean) => void
  getJobStatusLabel: (job: BatchSubtitleJob) => string
  formatElapsed: (value: number | undefined) => string | null
  formatTimestamp: (value: number | undefined) => string
  getFailureCategory: (item: BatchSubtitleJob['items'][number]) => 'retryable' | 'needs-attention'
}): ReactElement {
  return (
    <section className="batch-history-card">
      <div className="batch-history-heading">
        <strong>{copy.batchSubtitle.historyTitle}</strong>
        <button className="batch-log-button" type="button" onClick={onRefresh} disabled={isLoading}>
          <RefreshCcw size={13} className={isLoading ? 'diagnostic-log-refreshing' : undefined} />{copy.batchSubtitle.historyRefresh}
        </button>
      </div>
      {isLoading ? <div className="batch-history-empty">{copy.batchSubtitle.historyLoading}</div> : null}
      {!isLoading && notice ? <div className="batch-history-empty failed">{notice}</div> : null}
      {!isLoading && !notice && history.length === 0 ? <div className="batch-history-empty">{copy.batchSubtitle.historyEmpty}</div> : null}
      {!isLoading && !notice && history.length > 0 ? (
        <div className="batch-history-list">
          {history.map((historyJob) => {
            const failedItems = historyJob.items.filter((item) => item.status === 'failed')
            const retryableItems = failedItems.filter((item) => getFailureCategory(item) === 'retryable')
            return (
              <details className="batch-history-entry" key={historyJob.id}>
                <summary>
                  <span className="batch-history-summary-main"><strong>{getJobStatusLabel(historyJob)}</strong><span>{formatTimestamp(historyJob.completedAt ?? historyJob.startedAt)}</span></span>
                  <span className="batch-history-summary-meta">{formatElapsed(historyJob.elapsedMs) ?? '—'} · {copy.batchSubtitle.historyFiles(historyJob.summary.completed, historyJob.summary.total, historyJob.summary.failed)}</span>
                </summary>
                <div className="batch-history-body">
                  <div className="batch-history-meta"><span>{copy.subtitleLanguageOptions[historyJob.targetLanguage].label}</span><span>{copy.batchSubtitle.concurrencyValue(historyJob.maxConcurrent)}</span></div>
                  <div className="batch-history-root" title={historyJob.rootPath}>{copy.batchSubtitle.historyRoot}: {historyJob.rootPath}</div>
                  {failedItems.length > 0 ? (
                    <div className="batch-history-failures">
                      {failedItems.slice(0, 3).map((item) => (
                        <div className={getFailureCategory(item)} key={item.id} title={item.error}>
                          <span>{getFailureCategory(item) === 'retryable' ? copy.batchSubtitle.failureRetryable : copy.batchSubtitle.failureNeedsAttention}</span>
                          {item.file.name}: {item.error}
                        </div>
                      ))}
                      {failedItems.length > 3 ? <div>… +{failedItems.length - 3}</div> : null}
                    </div>
                  ) : null}
                  {failedItems.length > 0 && !activeJob ? (
                    <button className="asr-action-button" type="button" onClick={() => onRetry(historyJob.id, retryableItems.length > 0)}>
                      <RefreshCcw size={14} />{retryableItems.length > 0 ? copy.batchSubtitle.retryRetryable : copy.batchSubtitle.historyRetry}
                    </button>
                  ) : null}
                </div>
              </details>
            )
          })}
        </div>
      ) : null}
    </section>
  )
}
