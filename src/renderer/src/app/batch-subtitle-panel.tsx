import { useCallback, useEffect, useMemo, useState, type ReactElement } from 'react'
import { RefreshCcw } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { BatchSubtitleItem, BatchSubtitleJob, MediaFile } from '../../../shared/media-types'
import type { SubtitleTargetLanguageId } from '../../../shared/app-settings'
import { getBatchSubtitleFailureCategory } from '../../../shared/batch-subtitle-utils'
import { DiagnosticLogViewer } from './diagnostic-log-viewer'
import { BatchPanelHistory } from './batch-panel-history'
import { BatchPanelItems } from './batch-panel-items'
import { BatchPanelJob } from './batch-panel-job'
import { BatchPanelSetup } from './batch-panel-setup'
import { useBatchPanelActions } from './use-batch-panel-actions'
import { formatElapsed, getBatchTimingStats } from './batch-panel-formatters'

type BatchSubtitlePanelProps = {
  copy: LocaleCopy
  targetLanguage: SubtitleTargetLanguageId
  modelId?: string
  onTargetLanguageChange: (targetLanguage: SubtitleTargetLanguageId) => void
}

export function BatchSubtitlePanel({
  copy,
  targetLanguage,
  modelId,
  onTargetLanguageChange
}: BatchSubtitlePanelProps): ReactElement {
  const [directoryPath, setDirectoryPath] = useState<string | null>(null)
  const [files, setFiles] = useState<MediaFile[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [includeSubfolders, setIncludeSubfolders] = useState(false)
  const [onlyMissing, setOnlyMissing] = useState(true)
  const [maxConcurrent, setMaxConcurrent] = useState(1)
  const [maxRetries, setMaxRetries] = useState(2)
  const [isScanning, setIsScanning] = useState(false)
  const [job, setJob] = useState<BatchSubtitleJob | null>(null)
  const [history, setHistory] = useState<BatchSubtitleJob[]>([])
  const [isHistoryLoading, setIsHistoryLoading] = useState(false)
  const [historyNotice, setHistoryNotice] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [timingNow, setTimingNow] = useState(() => Date.now())
  const activeJob = job?.status === 'running' || job?.status === 'paused'
  const selectedFiles = useMemo(() => files.filter((file) => selectedPaths.has(file.path)), [files, selectedPaths])
  const currentItem = job?.currentItemId ? job.items.find((item) => item.id === job.currentItemId) ?? null : null
  const failedItems = job?.items.filter((item) => item.status === 'failed') ?? []
  const retryableFailedCount = failedItems.filter((item) => getBatchSubtitleFailureCategory(item) === 'retryable').length
  const needsAttentionFailedCount = failedItems.length - retryableFailedCount
  const timingStats = job ? getBatchTimingStats(job, timingNow) : null

  const loadHistory = useCallback(async (): Promise<void> => {
    setIsHistoryLoading(true)
    setHistoryNotice(null)
    try {
      setHistory(await window.aiv.getBatchSubtitleHistory())
    } catch (error) {
      setHistoryNotice(error instanceof Error ? error.message : copy.batchSubtitle.historyLoadFailed)
    } finally {
      setIsHistoryLoading(false)
    }
  }, [copy.batchSubtitle.historyLoadFailed])

  useEffect(() => {
    if (!activeJob) return
    setTimingNow(Date.now())
    const timer = window.setInterval(() => setTimingNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [activeJob])

  useEffect(() => {
    let disposed = false
    void window.aiv.getCurrentBatchSubtitle().then((currentJob) => {
      if (!disposed) {
        setJob(currentJob)
        if (currentJob) {
          setOnlyMissing(currentJob.onlyMissing)
          setMaxConcurrent(currentJob.maxConcurrent)
          setMaxRetries(currentJob.maxRetries)
        }
      }
    })
    const cleanup = window.aiv.onBatchSubtitleProgress((nextJob) => {
      if (!disposed) {
        setJob(nextJob)
        setOnlyMissing(nextJob.onlyMissing)
        setMaxConcurrent(nextJob.maxConcurrent)
        setMaxRetries(nextJob.maxRetries)
      }
    })
    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  useEffect(() => { void loadHistory() }, [loadHistory])
  useEffect(() => {
    if (job && ['completed', 'cancelled', 'failed'].includes(job.status)) void loadHistory()
  }, [job?.id, job?.status, loadHistory])

  const {
    scanDirectory,
    chooseFolder,
    toggleSelectedFile,
    pauseOrResume,
    cancelBatch,
    retryFailed,
    retryHistory,
    openLogDirectory
  } = useBatchPanelActions({
    copy,
    directoryPath,
    includeSubfolders,
    activeJob: Boolean(activeJob),
    setDirectoryPath,
    setFiles,
    setSelectedPaths,
    setIsScanning,
    setNotice,
    setJob,
    setHistoryNotice
  })

  return (
    <div className="batch-panel">
      <div className="panel-header"><div><span className="panel-kicker">{copy.panels.batchKicker}</span><h2>{copy.panels.batchTitle}</h2></div><RefreshCcw size={19} /></div>
      <div className="batch-intro">{copy.batchSubtitle.description}</div>
      <BatchPanelSetup
        copy={copy}
        targetLanguage={targetLanguage}
        directoryPath={directoryPath}
        files={files}
        selectedFilesCount={selectedFiles.length}
        selectedPaths={selectedPaths}
        includeSubfolders={includeSubfolders}
        onlyMissing={onlyMissing}
        maxConcurrent={maxConcurrent}
        maxRetries={maxRetries}
        activeJob={Boolean(activeJob)}
        isScanning={isScanning}
        onChooseFolder={() => void chooseFolder()}
        onScanDirectory={(path) => void scanDirectory(path)}
        onIncludeSubfoldersChange={setIncludeSubfolders}
        onOnlyMissingChange={setOnlyMissing}
        onMaxConcurrentChange={setMaxConcurrent}
        onMaxRetriesChange={setMaxRetries}
        onSelectAll={() => setSelectedPaths(new Set(files.map((file) => file.path)))}
        onClearSelection={() => setSelectedPaths(new Set())}
        onToggleFile={toggleSelectedFile}
        onTargetLanguageChange={onTargetLanguageChange}
      />
      <BatchPanelJob
        copy={copy}
        job={job}
        currentItem={currentItem}
        timingStats={timingStats}
        completedCount={job?.summary.completed ?? 0}
        activeJob={Boolean(activeJob)}
        canRetry={Boolean(job?.summary.failed && !activeJob)}
        retryableFailedCount={retryableFailedCount}
        needsAttentionFailedCount={needsAttentionFailedCount}
        onPauseOrResume={() => void pauseOrResume(job)}
        onCancel={() => void cancelBatch()}
        onRetryFailed={(retryableOnly) => void retryFailed(retryableOnly)}
        onOpenLogDirectory={() => void openLogDirectory()}
        getJobStatusLabel={(currentJob) => copy.batchSubtitle.jobStatus[currentJob.status]}
        formatElapsed={formatElapsed}
      />
      <DiagnosticLogViewer copy={copy.diagnostics} />
      <BatchPanelHistory
        copy={copy}
        history={history}
        isLoading={isHistoryLoading}
        notice={historyNotice}
        activeJob={Boolean(activeJob)}
        onRefresh={() => void loadHistory()}
        onRetry={(jobId, retryableOnly) => void retryHistory(jobId, retryableOnly)}
        getJobStatusLabel={(currentJob) => copy.batchSubtitle.jobStatus[currentJob.status]}
        formatElapsed={formatElapsed}
        formatTimestamp={(timestamp) => timestamp ? new Date(timestamp).toLocaleString() : '—'}
        getFailureCategory={(item) => getBatchSubtitleFailureCategory(item) === 'retryable' ? 'retryable' : 'needs-attention'}
      />
      <BatchPanelItems
        copy={copy}
        job={job}
        formatElapsed={formatElapsed}
        getItemStatusLabel={(item: BatchSubtitleItem) => copy.batchSubtitle.itemStatus[item.status]}
      />
      {notice ? <div className="asr-result failed">{notice}</div> : null}
    </div>
  )
}
