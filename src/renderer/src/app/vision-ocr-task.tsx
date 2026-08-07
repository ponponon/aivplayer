import { ScanSearch, Square } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { MediaEvidenceCapabilities, MediaEvidenceTask } from '../../../shared/evidence-task-types'
import type { LocaleCopy } from '../../../shared/i18n'

type VisionOcrTaskProps = {
  copy: LocaleCopy['vision']
  mediaPath: string | null
  currentTime: number
}

function formatSeconds(value: number): string {
  return Math.max(0, value).toFixed(1)
}

function taskStatusLabel(copy: LocaleCopy['vision'], task: MediaEvidenceTask | null): string {
  if (!task) return ''
  if (task.status === 'queued') return copy.ocrQueued
  if (task.status === 'running' || task.status === 'retrying') return copy.ocrProcessing(Math.round(task.progress * 100))
  if (task.status === 'cancelled') return copy.ocrCancelled
  if (task.status === 'failed') return task.error ?? copy.ocrFailed
  return task.persistenceMessage ?? copy.ocrCompleted
}

export function VisionOcrTask({ copy, mediaPath, currentTime }: VisionOcrTaskProps): React.ReactElement {
  const [capabilities, setCapabilities] = useState<MediaEvidenceCapabilities | null>(null)
  const [task, setTask] = useState<MediaEvidenceTask | null>(null)
  const [startInput, setStartInput] = useState('0.0')
  const [endInput, setEndInput] = useState('5.0')
  const [error, setError] = useState<string | null>(null)
  const isRunning = task?.status === 'queued' || task?.status === 'running' || task?.status === 'retrying'

  useEffect(() => {
    let active = true
    void window.aiv.getMediaEvidenceCapabilities().then((next) => {
      if (active) setCapabilities(next)
    }).catch((reason: unknown) => {
      if (active) setError(reason instanceof Error ? reason.message : String(reason))
    })
    const removeProgressListener = window.aiv.onMediaEvidenceTaskProgress((next) => {
      if (active && next.kind === 'ocr') setTask(next)
    })
    return () => {
      active = false
      removeProgressListener()
    }
  }, [])

  const usePlayhead = (): void => {
    const start = Math.max(0, currentTime)
    setStartInput(formatSeconds(start))
    setEndInput(formatSeconds(start + 5))
    setError(null)
  }

  const startOcr = (): void => {
    if (!mediaPath || isRunning) return
    const startSeconds = Number(startInput)
    const endSeconds = Number(endInput)
    if (!Number.isFinite(startSeconds) || !Number.isFinite(endSeconds) || startSeconds < 0 || endSeconds <= startSeconds) {
      setError(copy.ocrInvalidRange)
      return
    }
    setError(null)
    setTask(null)
    void window.aiv.startMediaEvidenceTask({
      kind: 'ocr',
      mediaPath,
      inputHash: `ocr:${startSeconds.toFixed(3)}:${endSeconds.toFixed(3)}`,
      ranges: [{ startSeconds, endSeconds }],
      maxRetries: 2
    }).then(setTask).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const cancelOcr = (): void => {
    void window.aiv.cancelMediaEvidenceTask().catch((reason: unknown) => setError(reason instanceof Error ? reason.message : String(reason)))
  }

  const capabilityMessage = capabilities === null
    ? copy.ocrChecking
    : capabilities.ocr.available
      ? copy.ocrReady
      : capabilities.ocr.message || copy.ocrUnavailable

  return <section className="vision-card vision-ocr-card" data-testid="vision-ocr-task" data-persistence-status={task?.persistenceStatus ?? 'idle'}>
    <div className="vision-heading"><div><span className="panel-kicker">{copy.ocrKicker}</span><h3>{copy.ocrTitle}</h3></div><ScanSearch size={17} /></div>
    <p className="vision-ocr-description">{copy.ocrDescription}</p>
    <div className={`vision-ocr-capability${capabilities?.ocr.available ? ' is-ready' : ''}`} role="status"><span>{capabilityMessage}</span><small>{mediaPath ? mediaPath.split(/[\\/]/).pop() : copy.ocrNoMedia}</small></div>
    <div className="vision-ocr-fields">
      <label><span>{copy.ocrStartLabel}</span><input data-testid="vision-ocr-start" type="number" min="0" step="0.1" value={startInput} onChange={(event) => setStartInput(event.currentTarget.value)} disabled={isRunning} /></label>
      <label><span>{copy.ocrEndLabel}</span><input data-testid="vision-ocr-end" type="number" min="0" step="0.1" value={endInput} onChange={(event) => setEndInput(event.currentTarget.value)} disabled={isRunning} /></label>
    </div>
    <div className="vision-index-actions">
      <button className="vision-primary-action" data-testid="vision-ocr-start-button" type="button" onClick={startOcr} disabled={!mediaPath || !capabilities?.ocr.available || isRunning}><ScanSearch size={14} />{copy.ocrStart}</button>
      <button className="vision-secondary-action" type="button" onClick={usePlayhead} disabled={isRunning}>{copy.ocrUsePlayhead}</button>
      {isRunning ? <button className="vision-secondary-action" data-testid="vision-ocr-cancel-button" type="button" onClick={cancelOcr}><Square size={13} />{copy.ocrCancel}</button> : null}
    </div>
    {task ? <div className="vision-ocr-status" role="status"><span>{taskStatusLabel(copy, task)}</span>{task.status === 'running' || task.status === 'retrying' ? <strong>{Math.round(task.progress * 100)}%</strong> : task.persistenceStatus === 'skipped-stale' ? <strong>{copy.ocrStale}</strong> : task.persistenceStatus === 'failed' ? <strong>{copy.ocrPersistenceFailed}</strong> : null}</div> : null}
    {error ? <small className="vision-error">{error}</small> : null}
  </section>
}
