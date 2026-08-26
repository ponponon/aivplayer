import { useEffect, useRef, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AsrModelDownloadProgress } from '../../../shared/media-types'
import { formatElapsedTime } from './app-helpers'
import {
  calculateDownloadSpeed,
  estimateDownloadEtaMs,
  formatDownloadBytes,
  getDownloadPercent
} from './asr-model-download-progress-utils'

type DownloadSpeedSample = {
  key: string
  receivedBytes: number
  measuredAt: number
}

function useDownloadSpeed(progress: AsrModelDownloadProgress | null): number | null {
  const [speedBytesPerSecond, setSpeedBytesPerSecond] = useState<number | null>(null)
  const sampleRef = useRef<DownloadSpeedSample | null>(null)

  useEffect(() => {
    if (!progress) {
      sampleRef.current = null
      setSpeedBytesPerSecond(null)
      return
    }

    const now = Date.now()
    const key = `${progress.modelId}:${progress.sourceId}:${progress.fileName}`
    const previous = sampleRef.current
    if (!previous || previous.key !== key || progress.receivedBytes < previous.receivedBytes) {
      sampleRef.current = { key, receivedBytes: progress.receivedBytes, measuredAt: now }
      setSpeedBytesPerSecond(null)
      return
    }

    const elapsedMs = now - previous.measuredAt
    if (elapsedMs < 1000) return

    const nextSpeed = calculateDownloadSpeed(previous.receivedBytes, progress.receivedBytes, elapsedMs)
    sampleRef.current = { key, receivedBytes: progress.receivedBytes, measuredAt: now }
    setSpeedBytesPerSecond((currentSpeed) => {
      if (nextSpeed == null) return null
      return currentSpeed == null ? nextSpeed : currentSpeed * 0.35 + nextSpeed * 0.65
    })
  }, [progress?.fileName, progress?.modelId, progress?.receivedBytes, progress?.sourceId])

  return speedBytesPerSecond
}

export function AsrModelDownloadProgress(props: {
  copy: LocaleCopy
  progress: AsrModelDownloadProgress | null
  expectedSizeBytes?: number
  className?: string
}): React.ReactElement {
  const { copy, progress, expectedSizeBytes, className } = props
  const speedBytesPerSecond = useDownloadSpeed(progress)
  const receivedBytes = progress?.receivedBytes ?? 0
  const totalBytes = progress?.totalBytes ?? expectedSizeBytes ?? null
  const percent = getDownloadPercent(progress?.percent ?? null, receivedBytes, totalBytes)
  const etaMs = estimateDownloadEtaMs(receivedBytes, totalBytes, speedBytesPerSecond)
  const percentLabel = percent == null ? copy.modelView.progressPending : `${Math.round(percent * 100)}%`
  const receivedLabel = formatDownloadBytes(receivedBytes)
  const totalLabel = totalBytes == null ? copy.modelView.downloadSizeUnknown : formatDownloadBytes(totalBytes)
  const bytesLabel = copy.modelView.downloadBytes(receivedLabel, totalLabel)
  const speedLabel = speedBytesPerSecond == null ? null : copy.modelView.downloadSpeed(formatDownloadBytes(speedBytesPerSecond))
  const etaLabel = etaMs == null ? copy.modelView.downloadEtaUnknown : copy.modelView.downloadEta(formatElapsedTime(etaMs))
  const ariaValueText = `${percentLabel} · ${bytesLabel} · ${speedLabel ?? etaLabel}`
  const classNames = ['model-download-progress', className].filter(Boolean).join(' ')

  return (
    <div className={classNames}>
      <div className="model-download-progress-line">
        <div className="model-download-progress-stats">
          <span>{bytesLabel}</span>
          {speedLabel ? <span>{speedLabel}</span> : null}
          <span>{etaLabel}</span>
        </div>
        <strong className="model-download-progress-percent">{percentLabel}</strong>
      </div>
      <div
        className={`model-download-progress-track${percent == null ? ' is-indeterminate' : ''}`}
        role="progressbar"
        aria-label={copy.modelView.downloadingLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent == null ? undefined : Math.round(percent * 100)}
        aria-valuetext={ariaValueText}
      >
        <i style={percent == null ? undefined : { width: `${Math.round(percent * 100)}%` }} />
      </div>
    </div>
  )
}
