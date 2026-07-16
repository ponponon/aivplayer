export function formatElapsed(ms: number | undefined): string | null {
  if (ms == null) return null
  const totalSeconds = Math.max(0, Math.round(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return minutes > 0 ? `${minutes}m ${String(seconds).padStart(2, '0')}s` : `${seconds}s`
}

import type { BatchSubtitleJob } from '../../../shared/media-types'
import type { BatchTimingStats } from './batch-panel-job'

export function getBatchTimingStats(job: BatchSubtitleJob, now: number): BatchTimingStats {
  const elapsedMs = job.elapsedMs ?? Math.max(0, (job.completedAt ?? now) - job.startedAt)
  const measured = job.items.filter((item) => item.status === 'completed' && item.elapsedMs != null)
  const averageItemElapsedMs = measured.length > 0
    ? Math.round(measured.reduce((total, item) => total + (item.elapsedMs ?? 0), 0) / measured.length)
    : null
  const remainingCount = job.summary.queued + job.summary.processing
  const estimatedRemainingMs = averageItemElapsedMs != null && remainingCount > 0
    ? Math.round((averageItemElapsedMs * remainingCount) / Math.max(1, job.maxConcurrent))
    : null
  return { elapsedMs, averageItemElapsedMs, estimatedRemainingMs }
}
