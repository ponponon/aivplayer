import type { PointerEvent as ReactPointerEvent } from 'react'
import type { EditingWaveformSegment } from '../../../core/editing/waveform-operations'
import { formatTime } from '../lib/time'

type Props = {
  segments: readonly EditingWaveformSegment[]
  durationSeconds: number
  currentTime: number
  trackLabel: string
  emptyLabel: string
  onSeek: (seconds: number) => void
}

function seekFromPointer(event: ReactPointerEvent<HTMLDivElement>, durationSeconds: number, onSeek: (seconds: number) => void): void {
  const bounds = event.currentTarget.getBoundingClientRect()
  if (bounds.width <= 0 || durationSeconds <= 0) return
  const ratio = Math.min(1, Math.max(0, (event.clientX - bounds.left) / bounds.width))
  onSeek(ratio * durationSeconds)
}

export function EditingWaveformTrack({ segments, durationSeconds, currentTime, trackLabel, emptyLabel, onSeek }: Props): React.ReactElement {
  const playheadPercent = durationSeconds > 0 ? Math.min(100, Math.max(0, (currentTime / durationSeconds) * 100)) : 0
  return <div className="editing-track-row editing-waveform-row">
    <span className="editing-track-label">{trackLabel}</span>
    <div
      className="editing-waveform-track"
      data-testid="editing-waveform-track"
      role="slider"
      tabIndex={0}
      aria-label={trackLabel}
      aria-valuemin={0}
      aria-valuemax={durationSeconds}
      aria-valuenow={currentTime}
      onPointerDown={(event) => { event.stopPropagation(); seekFromPointer(event, durationSeconds, onSeek) }}
      onKeyDown={(event) => {
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        event.stopPropagation()
        onSeek(Math.min(durationSeconds, Math.max(0, currentTime + (event.key === 'ArrowLeft' ? -0.1 : 0.1))))
      }}
    >
      {segments.length > 0 ? segments.map((segment) => {
        const editedDuration = Math.max(0.001, segment.editedEndSeconds - segment.editedStartSeconds)
        const sourceDuration = Math.max(0.001, segment.sourceDurationSeconds)
        return <div
          className="editing-waveform-segment"
          key={`${segment.sourceId}-${segment.editedStartSeconds}`}
          style={{ left: `${(segment.editedStartSeconds / Math.max(0.001, durationSeconds)) * 100}%`, width: `${(editedDuration / Math.max(0.001, durationSeconds)) * 100}%` }}
        >
          <img src={segment.url} alt="" draggable={false} style={{ width: `${(sourceDuration / editedDuration) * 100}%`, left: `${-(segment.sourceStartSeconds / editedDuration) * 100}%` }} />
        </div>
      }) : <span className="editing-waveform-empty">{emptyLabel}</span>}
      <div className="editing-waveform-playhead" style={{ left: `${playheadPercent}%` }} aria-hidden="true"><span>{formatTime(currentTime)}</span></div>
    </div>
  </div>
}
