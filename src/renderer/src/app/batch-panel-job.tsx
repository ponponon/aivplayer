import { FolderOpen, Pause, Play, RefreshCcw, Square } from 'lucide-react'
import type { ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { BatchSubtitleItem, BatchSubtitleJob } from '../../../shared/media-types'

export type BatchTimingStats = {
  elapsedMs: number
  averageItemElapsedMs: number | null
  estimatedRemainingMs: number | null
}

export type BatchPanelJobProps = {
  copy: LocaleCopy
  job: BatchSubtitleJob | null
  currentItem: BatchSubtitleItem | null
  timingStats: BatchTimingStats | null
  completedCount: number
  activeJob: boolean
  canRetry: boolean
  retryableFailedCount: number
  needsAttentionFailedCount: number
  onPauseOrResume: () => void
  onCancel: () => void
  onRetryFailed: (retryableOnly?: boolean) => void
  onOpenLogDirectory: () => void
  getJobStatusLabel: (job: BatchSubtitleJob) => string
  formatElapsed: (value: number | undefined) => string | null
}

export function BatchPanelJob({
  copy,
  job,
  currentItem,
  timingStats,
  completedCount,
  activeJob,
  canRetry,
  retryableFailedCount,
  needsAttentionFailedCount,
  onPauseOrResume,
  onCancel,
  onRetryFailed,
  onOpenLogDirectory,
  getJobStatusLabel,
  formatElapsed
}: BatchPanelJobProps): ReactElement {
  return (
    <>
      {job ? (
        <div className="batch-task-card">
          <div className="batch-task-heading">
            <strong>{getJobStatusLabel(job)}</strong>
            <span>{copy.batchSubtitle.progress(completedCount, job.summary.total)} · {copy.batchSubtitle.concurrencyValue(job.maxConcurrent)}</span>
          </div>
          <div className="batch-progress-track">
            <div className="progress-fill" style={{ width: `${job.summary.total ? Math.round((completedCount / job.summary.total) * 100) : 0}%` }} />
          </div>
          {timingStats ? (
            <div className="batch-timing-grid">
              <TimingItem label={copy.batchSubtitle.timingElapsed} value={formatElapsed(timingStats.elapsedMs) ?? '—'} />
              <TimingItem label={copy.batchSubtitle.timingAverage} value={formatElapsed(timingStats.averageItemElapsedMs ?? undefined) ?? (job.status === 'running' ? copy.batchSubtitle.timingCalculating : '—')} />
              <TimingItem label={copy.batchSubtitle.timingRemaining} value={formatElapsed(timingStats.estimatedRemainingMs ?? undefined) ?? '—'} />
              <TimingItem label={copy.batchSubtitle.timingActive(job.summary.processing, job.maxConcurrent)} value={`${job.summary.completed} / ${job.summary.total}`} />
            </div>
          ) : null}
          {currentItem ? (
            <div className="batch-current-file">
              <span>{copy.batchSubtitle.currentFile}</span>
              <strong title={currentItem.file.name}>{currentItem.file.name}</strong>
              <span>{currentItem.percent == null ? '—' : `${Math.round(currentItem.percent * 100)}%`}</span>
            </div>
          ) : null}
          {job.pauseRequested && job.status === 'running' ? <div className="batch-task-hint">{copy.batchSubtitle.pauseRequested}</div> : null}
          {job.message === 'paused-after-restart' ? <div className="batch-task-hint">{copy.batchSubtitle.recoveredTask}</div> : null}
          {retryableFailedCount + needsAttentionFailedCount > 0 ? (
            <div className="batch-failure-summary">
              {retryableFailedCount > 0 ? <span className="retryable">{copy.batchSubtitle.failureRetryable} {retryableFailedCount}</span> : null}
              {needsAttentionFailedCount > 0 ? <span className="needs-attention">{copy.batchSubtitle.failureNeedsAttention} {needsAttentionFailedCount}</span> : null}
            </div>
          ) : null}
          <div className="batch-task-actions">
            {activeJob ? (
              <>
                <button className="asr-action-button" type="button" onClick={onPauseOrResume}>
                  {job.status === 'paused' ? <Play size={15} /> : <Pause size={15} />}
                  {job.status === 'paused' ? copy.batchSubtitle.resume : copy.batchSubtitle.pause}
                </button>
                <button className="asr-action-button danger" type="button" onClick={onCancel}><Square size={14} />{copy.batchSubtitle.cancel}</button>
              </>
            ) : canRetry ? (
              <>
                {retryableFailedCount > 0 ? <button className="asr-action-button" type="button" onClick={() => onRetryFailed(true)}><RefreshCcw size={15} />{copy.batchSubtitle.retryRetryable}</button> : null}
                {needsAttentionFailedCount > 0 ? <button className="asr-action-button" type="button" onClick={() => onRetryFailed()}><RefreshCcw size={15} />{copy.batchSubtitle.retryFailed}</button> : null}
              </>
            ) : null}
            <button className="batch-log-button" type="button" onClick={onOpenLogDirectory}><FolderOpen size={14} />{copy.batchSubtitle.openLogs}</button>
          </div>
        </div>
      ) : (
        <div className="batch-task-card muted">{copy.batchSubtitle.emptyTask}</div>
      )}
    </>
  )
}

function TimingItem({ label, value }: { label: string; value: string }): ReactElement {
  return <div className="batch-timing-item"><span>{label}</span><strong>{value}</strong></div>
}
