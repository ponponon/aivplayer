import { AlertTriangle, CheckSquare, RefreshCw, Square } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionIndexFailureRecord } from '../../../shared/vision-types'

type VisionIndexFailuresProps = {
  copy: LocaleCopy['vision']
  failures: VisionIndexFailureRecord[]
  onRetry: (failure: VisionIndexFailureRecord) => Promise<void>
  onBatchRetry: (failures: VisionIndexFailureRecord[]) => Promise<void>
}

function formatFailureTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export function VisionIndexFailures({ copy, failures, onRetry, onBatchRetry }: VisionIndexFailuresProps): ReactElement | null {
  const [retryingId, setRetryingId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchRetrying, setBatchRetrying] = useState(false)
  const selectedFailures = failures.filter((failure) => selectedIds.has(failure.id))
  const allSelected = failures.length > 0 && failures.every((failure) => selectedIds.has(failure.id))

  useEffect(() => {
    setSelectedIds((current) => {
      const availableIds = new Set(failures.map((failure) => failure.id))
      const next = new Set([...current].filter((id) => availableIds.has(id)))
      return next.size === current.size ? current : next
    })
  }, [failures])

  if (failures.length === 0) return null

  const retry = async (failure: VisionIndexFailureRecord): Promise<void> => {
    if (retryingId || batchRetrying) return
    setRetryingId(failure.id)
    try {
      await onRetry(failure)
    } finally {
      setRetryingId(null)
    }
  }

  const retrySelected = async (): Promise<void> => {
    if (selectedFailures.length === 0 || retryingId || batchRetrying) return
    setBatchRetrying(true)
    try {
      await onBatchRetry(selectedFailures)
      setSelectedIds(new Set())
    } finally {
      setBatchRetrying(false)
    }
  }

  const toggleSelection = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const toggleAll = (): void => {
    setSelectedIds(allSelected ? new Set() : new Set(failures.map((failure) => failure.id)))
  }

  return <section className="vision-index-failures" aria-label={copy.indexFailuresTitle}>
    <div className="vision-index-failures-heading"><div><strong>{copy.indexFailuresTitle}</strong><small>{copy.indexFailuresDescription}</small></div><AlertTriangle size={15} /></div>
    <div className="vision-index-failures-batch"><button className="vision-secondary-action" type="button" onClick={toggleAll} disabled={retryingId !== null || batchRetrying}>{allSelected ? <Square size={13} /> : <CheckSquare size={13} />}{allSelected ? copy.indexFailureClearSelection : copy.indexFailureSelectAll}</button>{selectedFailures.length > 0 ? <><span>{copy.indexFailureSelected(selectedFailures.length)}</span><button className="vision-primary-action" type="button" onClick={() => void retrySelected()} disabled={retryingId !== null || batchRetrying}><RefreshCw size={12} />{batchRetrying ? copy.indexFailureBatchRetrying : copy.indexFailureBatchRetry}</button></> : null}</div>
    <div className="vision-index-failure-list">
      {failures.map((failure) => <article className="vision-index-failure" key={failure.id}>
        <div className="vision-index-failure-copy"><div className="vision-index-failure-title"><input type="checkbox" checked={selectedIds.has(failure.id)} onChange={() => toggleSelection(failure.id)} disabled={retryingId !== null || batchRetrying} aria-label={copy.indexFailureSelectItem(failure.fileName)} /><strong title={failure.mediaPath}>{failure.fileName}</strong></div>
          <small title={failure.mediaPath}>{failure.mediaPath}</small>
          <span>{failure.error}</span>
          <em>{copy.indexFailureMeta(failure.retryCount, formatFailureTime(failure.lastAttemptAt))}</em>
        </div>
        <button className="vision-secondary-action" type="button" disabled={retryingId !== null || batchRetrying} onClick={() => void retry(failure)}><RefreshCw size={12} />{retryingId === failure.id ? copy.indexFailureRetrying : copy.indexFailureRetry}</button>
      </article>)}
    </div>
  </section>
}
