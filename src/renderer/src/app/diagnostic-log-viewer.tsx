import { ListChecks, RefreshCcw } from 'lucide-react'
import { useMemo, useState, type ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AsrDiagnosticLogEntry } from '../../../shared/media-types'

type DiagnosticLogViewerProps = {
  copy: LocaleCopy['diagnostics']
}

function isFailureEntry(entry: AsrDiagnosticLogEntry): boolean {
  return entry.success === false || entry.event.includes('failed') || entry.event.includes('threw')
}

function isBatchEntry(entry: AsrDiagnosticLogEntry): boolean {
  return typeof entry.jobId === 'string'
}

type LogFilter = 'all' | 'failed' | 'asr' | 'batch'

function formatTimestamp(timestamp: string): string {
  const date = new Date(timestamp)
  return Number.isNaN(date.getTime()) ? timestamp : date.toLocaleString()
}

export function DiagnosticLogViewer({ copy }: DiagnosticLogViewerProps): ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [entries, setEntries] = useState<AsrDiagnosticLogEntry[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [filter, setFilter] = useState<LogFilter>('all')
  const [copyNotice, setCopyNotice] = useState<string | null>(null)

  const visibleEntries = useMemo(() => entries.filter((entry) => {
    if (filter === 'failed') {
      return isFailureEntry(entry)
    }
    if (filter === 'batch') {
      return isBatchEntry(entry)
    }
    if (filter === 'asr') {
      return !isBatchEntry(entry)
    }
    return true
  }), [entries, filter])

  const loadLogs = async (): Promise<void> => {
    setIsLoading(true)
    setNotice(null)
    try {
      const result = await window.aiv.getRecentAsrLogs()
      if (!result.success) {
        setNotice(result.message || copy.loadFailed)
        return
      }

      setEntries(result.entries)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setIsLoading(false)
    }
  }

  const toggleViewer = (): void => {
    const nextOpen = !isOpen
    setIsOpen(nextOpen)
    if (nextOpen) {
      void loadLogs()
    }
  }

  const copyLogs = async (logs: AsrDiagnosticLogEntry[]): Promise<void> => {
    try {
      const result = await window.aiv.copyTextToClipboard({
        text: JSON.stringify(logs, null, 2)
      })
      setCopyNotice(result.success ? copy.copied : result.message || copy.copyFailed)
    } catch {
      setCopyNotice(copy.copyFailed)
    }
  }

  return (
    <section className="diagnostic-log-viewer">
      <div className="diagnostic-log-toolbar">
        <button
          className="batch-log-button"
          type="button"
          aria-expanded={isOpen}
          onClick={toggleViewer}
        >
          <ListChecks size={14} />
          {isOpen ? copy.close : copy.open}
        </button>
        {isOpen ? (
          <button
            className="batch-log-button"
            type="button"
            aria-label={copy.refresh}
            title={copy.refresh}
            onClick={() => void loadLogs()}
            disabled={isLoading}
          >
            <RefreshCcw size={13} className={isLoading ? 'diagnostic-log-refreshing' : undefined} />
            {copy.refresh}
          </button>
        ) : null}
        {isOpen ? (
          <button
            className="batch-log-button"
            type="button"
            onClick={() => void copyLogs(visibleEntries)}
            disabled={isLoading || visibleEntries.length === 0}
          >
            {copy.copyVisible}
          </button>
        ) : null}
        {copyNotice ? <span className="diagnostic-log-copy-notice">{copyNotice}</span> : null}
      </div>
      {isOpen ? (
        <div className="diagnostic-log-content">
          <div className="diagnostic-log-filters" role="group" aria-label={copy.filterLabel}>
            {([
              ['all', copy.filterAll],
              ['failed', copy.filterFailures],
              ['asr', copy.filterAsr],
              ['batch', copy.filterBatch]
            ] as Array<[LogFilter, string]>).map(([value, label]) => (
              <button
                key={value}
                className={`diagnostic-log-filter ${filter === value ? 'is-selected' : ''}`}
                type="button"
                aria-pressed={filter === value}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          {isLoading ? <div className="diagnostic-log-empty">{copy.loading}</div> : null}
          {!isLoading && notice ? <div className="diagnostic-log-empty failed">{notice}</div> : null}
          {!isLoading && !notice && entries.length === 0 ? (
            <div className="diagnostic-log-empty">{copy.empty}</div>
          ) : null}
          {!isLoading && !notice && visibleEntries.length === 0 && entries.length > 0 ? (
            <div className="diagnostic-log-empty">{copy.emptyFiltered}</div>
          ) : null}
          {!isLoading && !notice && visibleEntries.length > 0 ? (
            <div className="diagnostic-log-list">
              {visibleEntries.map((entry, index) => (
                <details className={`diagnostic-log-entry ${isFailureEntry(entry) ? 'failed' : ''}`} key={`${entry.timestamp}-${entry.event}-${index}`}>
                  <summary>
                    <span className="diagnostic-log-event">{entry.event}</span>
                    <time dateTime={entry.timestamp}>{formatTimestamp(entry.timestamp)}</time>
                  </summary>
                  <pre>{JSON.stringify(entry, null, 2)}</pre>
                  <div className="diagnostic-log-entry-actions">
                    <button className="batch-log-button" type="button" onClick={() => void copyLogs([entry])}>
                      {copy.copyEntry}
                    </button>
                  </div>
                </details>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}
