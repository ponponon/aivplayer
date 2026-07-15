import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Check, FolderOpen, Pause, Play, RefreshCcw, Square } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type {
  BatchSubtitleItem,
  BatchSubtitleJob,
  MediaFile
} from '../../../shared/media-types'
import type { SubtitleTargetLanguageId } from '../../../shared/app-settings'

type BatchSubtitlePanelProps = {
  copy: LocaleCopy
  targetLanguage: SubtitleTargetLanguageId
  modelId?: string
  onTargetLanguageChange: (targetLanguage: SubtitleTargetLanguageId) => void
}

const targetLanguageIds: SubtitleTargetLanguageId[] = ['zh', 'en', 'ja', 'ko']

function formatElapsed(ms: number | undefined): string | null {
  if (ms == null) {
    return null
  }

  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

function getItemStatusLabel(copy: LocaleCopy, item: BatchSubtitleItem): string {
  return copy.batchSubtitle.itemStatus[item.status]
}

function getJobStatusLabel(copy: LocaleCopy, job: BatchSubtitleJob): string {
  return copy.batchSubtitle.jobStatus[job.status]
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
  const [isScanning, setIsScanning] = useState(false)
  const [job, setJob] = useState<BatchSubtitleJob | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const activeJob = job?.status === 'running' || job?.status === 'paused'
  const selectedFiles = useMemo(
    () => files.filter((file) => selectedPaths.has(file.path)),
    [files, selectedPaths]
  )
  const currentItem = job?.currentItemId ? job.items.find((item) => item.id === job.currentItemId) ?? null : null
  const completedCount = job?.summary.completed ?? 0
  const canRetry = Boolean(job?.summary.failed && !activeJob)

  useEffect(() => {
    let disposed = false

    void window.aiv.getCurrentBatchSubtitle().then((currentJob) => {
      if (!disposed) {
        setJob(currentJob)
        if (currentJob) {
          setOnlyMissing(currentJob.onlyMissing)
          setMaxConcurrent(currentJob.maxConcurrent)
        }
      }
    })

    const cleanup = window.aiv.onBatchSubtitleProgress((nextJob) => {
      if (!disposed) {
        setJob(nextJob)
        setOnlyMissing(nextJob.onlyMissing)
        setMaxConcurrent(nextJob.maxConcurrent)
      }
    })

    return () => {
      disposed = true
      cleanup()
    }
  }, [])

  const scanDirectory = async (path: string): Promise<void> => {
    setIsScanning(true)
    setNotice(null)

    try {
      const scannedFiles = await window.aiv.scanBatchSubtitleDirectory({
        directoryPath: path,
        recursive: includeSubfolders
      })
      setDirectoryPath(path)
      setFiles(scannedFiles)
      setSelectedPaths(new Set(scannedFiles.map((file) => file.path)))
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    } finally {
      setIsScanning(false)
    }
  }

  const chooseFolder = async (): Promise<void> => {
    const path = await window.aiv.openFolderPicker({
      title: copy.batchSubtitle.chooseFolder,
      defaultPath: directoryPath
    })

    if (path) {
      await scanDirectory(path)
    }
  }

  const toggleSelectedFile = (filePath: string): void => {
    if (activeJob) {
      return
    }

    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(filePath)) {
        next.delete(filePath)
      } else {
        next.add(filePath)
      }
      return next
    })
  }

  const startBatch = async (): Promise<void> => {
    if (!directoryPath || selectedFiles.length === 0 || activeJob) {
      return
    }

    setNotice(null)
    try {
      const nextJob = await window.aiv.startBatchSubtitle({
        rootPath: directoryPath,
        files: selectedFiles,
        targetLanguage,
        modelId,
        onlyMissing,
        maxConcurrent
      })
      setJob(nextJob)
    } catch (error) {
      setNotice(error instanceof Error ? error.message : String(error))
    }
  }

  const pauseOrResume = async (): Promise<void> => {
    const nextJob = job?.status === 'paused'
      ? await window.aiv.resumeBatchSubtitle()
      : await window.aiv.pauseBatchSubtitle()
    setJob(nextJob)
  }

  const cancelBatch = async (): Promise<void> => {
    setJob(await window.aiv.cancelBatchSubtitle())
  }

  const retryFailed = async (): Promise<void> => {
    setJob(await window.aiv.retryFailedBatchSubtitle())
  }

  const openLogDirectory = async (): Promise<void> => {
    const opened = await window.aiv.openBatchSubtitleLogDirectory()
    if (!opened) {
      setNotice(copy.batchSubtitle.openLogsFailed)
    }
  }

  return (
    <div className="batch-panel">
      <div className="panel-header">
        <div>
          <span className="panel-kicker">{copy.panels.batchKicker}</span>
          <h2>{copy.panels.batchTitle}</h2>
        </div>
        <RefreshCcw size={19} />
      </div>

      <div className="batch-intro">{copy.batchSubtitle.description}</div>

      <div className="batch-folder-row">
        <button className="asr-action-button" type="button" onClick={() => void chooseFolder()} disabled={isScanning || activeJob}>
          <FolderOpen size={16} />
          {copy.batchSubtitle.chooseFolder}
        </button>
        {directoryPath ? (
          <button className="batch-scan-button" type="button" onClick={() => void scanDirectory(directoryPath)} disabled={isScanning || activeJob}>
            {isScanning ? copy.batchSubtitle.scanning : copy.batchSubtitle.scan}
          </button>
        ) : null}
        <label className="batch-check-option">
          <input
            type="checkbox"
            checked={includeSubfolders}
            disabled={isScanning || activeJob}
            onChange={(event) => setIncludeSubfolders(event.target.checked)}
          />
          <span>{copy.batchSubtitle.includeSubfolders}</span>
        </label>
      </div>

      <label className="batch-check-option batch-option-secondary">
        <input
          type="checkbox"
          checked={onlyMissing}
          disabled={isScanning || activeJob}
          onChange={(event) => setOnlyMissing(event.target.checked)}
        />
        <span>{copy.batchSubtitle.onlyMissing}</span>
      </label>

      <div className="batch-concurrency-row">
        <span>{copy.batchSubtitle.concurrency}</span>
        <div className="subtitle-display-choice-group" role="group" aria-label={copy.batchSubtitle.concurrency}>
          {[1, 2, 3].map((count) => (
            <button
              key={count}
              className={`subtitle-display-choice ${maxConcurrent === count ? 'is-selected' : ''}`}
              type="button"
              disabled={isScanning || activeJob}
              aria-pressed={maxConcurrent === count}
              onClick={() => setMaxConcurrent(count)}
            >
              {copy.batchSubtitle.concurrencyValue(count)}
            </button>
          ))}
        </div>
      </div>

      {directoryPath ? <div className="batch-folder-path" title={directoryPath}>{directoryPath}</div> : null}

      {files.length > 0 ? (
        <div className="batch-selection-toolbar">
          <span>{copy.batchSubtitle.selectedCount(selectedFiles.length)}</span>
          <div>
            <button type="button" className="batch-text-button" onClick={() => setSelectedPaths(new Set(files.map((file) => file.path)))} disabled={activeJob}>
              {copy.batchSubtitle.selectAll}
            </button>
            <button type="button" className="batch-text-button" onClick={() => setSelectedPaths(new Set())} disabled={activeJob}>
              {copy.batchSubtitle.clearSelection}
            </button>
          </div>
        </div>
      ) : null}

      {isScanning ? <div className="batch-empty-state">{copy.batchSubtitle.scanning}</div> : null}
      {!isScanning && files.length === 0 ? <div className="batch-empty-state">{copy.batchSubtitle.noFiles}</div> : null}

      {files.length > 0 ? (
        <div className="batch-file-list">
          {files.map((file) => {
            const checked = selectedPaths.has(file.path)
            return (
              <label className={`batch-file-option ${checked ? 'selected' : ''}`} key={file.path}>
                <input
                  type="checkbox"
                  checked={checked}
                  disabled={activeJob}
                  onChange={() => toggleSelectedFile(file.path)}
                />
                <span className="batch-file-name" title={file.path}>{file.name}</span>
                <span className="batch-file-ext">{file.extension}</span>
              </label>
            )
          })}
        </div>
      ) : null}

      <div className="batch-target-row">
        <span>{copy.batchSubtitle.targetLanguage}</span>
        <div className="subtitle-display-choice-group" role="group" aria-label={copy.batchSubtitle.targetLanguage}>
          {targetLanguageIds.map((language) => (
            <button
              key={language}
              className={`subtitle-display-choice ${targetLanguage === language ? 'is-selected' : ''}`}
              type="button"
              disabled={activeJob}
              aria-pressed={targetLanguage === language}
              onClick={() => onTargetLanguageChange(language)}
            >
              {copy.subtitleLanguageOptions[language].label}
            </button>
          ))}
        </div>
      </div>

      {job ? (
        <div className="batch-task-card">
          <div className="batch-task-heading">
            <strong>{getJobStatusLabel(copy, job)}</strong>
            <span>
              {copy.batchSubtitle.progress(completedCount, job.summary.total)} · {copy.batchSubtitle.concurrencyValue(job.maxConcurrent)}
            </span>
          </div>
          <div className="batch-progress-track">
            <div className="progress-fill" style={{ width: `${job.summary.total ? Math.round((completedCount / job.summary.total) * 100) : 0}%` }} />
          </div>
          {currentItem ? (
            <div className="batch-current-file">
              <span>{copy.batchSubtitle.currentFile}</span>
              <strong title={currentItem.file.name}>{currentItem.file.name}</strong>
              <span>{currentItem.percent == null ? '—' : `${Math.round(currentItem.percent * 100)}%`}</span>
            </div>
          ) : null}
          {job.pauseRequested && job.status === 'running' ? <div className="batch-task-hint">{copy.batchSubtitle.pauseRequested}</div> : null}
          {job.message === 'paused-after-restart' ? <div className="batch-task-hint">{copy.batchSubtitle.recoveredTask}</div> : null}
          <div className="batch-task-actions">
            {activeJob ? (
              <>
                <button className="asr-action-button" type="button" onClick={() => void pauseOrResume()}>
                  {job.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                  {job.status === 'paused' ? copy.batchSubtitle.resume : copy.batchSubtitle.pause}
                </button>
                <button className="asr-action-button danger" type="button" onClick={() => void cancelBatch()}>
                  <Square size={14} />
                  {copy.batchSubtitle.cancel}
                </button>
              </>
          ) : canRetry ? (
              <button className="asr-action-button" type="button" onClick={() => void retryFailed()}>
                <RefreshCcw size={15} />
                {copy.batchSubtitle.retryFailed}
              </button>
            ) : null}
            <button className="batch-log-button" type="button" onClick={() => void openLogDirectory()}>
              <FolderOpen size={14} />
              {copy.batchSubtitle.openLogs}
            </button>
          </div>
        </div>
      ) : (
        <div className="batch-task-card muted">{copy.batchSubtitle.emptyTask}</div>
      )}

      {job ? (
        <div className="batch-task-list">
          {job.items.map((item) => {
            const elapsed = formatElapsed(item.elapsedMs)
            return (
              <div className={`batch-task-item ${item.status}`} key={item.id}>
                <span className="batch-task-icon">
                  {item.status === 'completed' ? <Check size={13} /> : item.status === 'failed' ? '!' : item.status === 'cancelled' ? '×' : item.status === 'asr' || item.status === 'translating' ? '…' : '·'}
                </span>
                <span className="batch-task-name" title={item.file.path}>{item.file.name}</span>
                <span className="batch-task-status">{getItemStatusLabel(copy, item)}</span>
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

      {notice ? <div className="asr-result failed">{notice}</div> : null}
    </div>
  )
}
