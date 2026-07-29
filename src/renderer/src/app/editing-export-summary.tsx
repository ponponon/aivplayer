import { Film, MonitorPlay, Volume2, VolumeX, Clock3 } from 'lucide-react'
import { getEditingClipVolume, isEditingClipMuted } from '../../../core/editing/audio-operations'
import { formatAspectRatio, formatResolution } from './media-formatters'
import { formatTime } from '../lib/time'
import type { EditingVideoClip } from '../../../shared/editing-types'

type EditingExportSummaryProps = {
  clips: readonly EditingVideoClip[]
  durationSeconds: number
  canvasWidth?: number
  canvasHeight?: number
  summaryLabel: string
  durationLabel: string
  clipsLabel: string
  resolutionLabel: string
  audioLabel: string
  muteLabel: string
  volumeLabel: string
}

export function EditingExportSummary({ clips, durationSeconds, canvasWidth, canvasHeight, summaryLabel, durationLabel, clipsLabel, resolutionLabel, audioLabel, muteLabel, volumeLabel }: EditingExportSummaryProps): React.ReactElement {
  const mutedClipCount = clips.filter((clip) => isEditingClipMuted(clip)).length
  const adjustedClipCount = clips.filter((clip) => isEditingClipMuted(clip) || getEditingClipVolume(clip) !== 1).length
  const audioValue = mutedClipCount === clips.length && clips.length > 0
    ? muteLabel
    : adjustedClipCount > 0
      ? `${volumeLabel} ×${adjustedClipCount}`
      : `${volumeLabel} 100%`
  const resolution = formatResolution(canvasWidth, canvasHeight)
  const ratio = formatAspectRatio(canvasWidth, canvasHeight, null)

  return <div className="editing-export-summary" role="group" aria-label={summaryLabel} data-testid="editing-export-summary">
    <span className="editing-export-summary-item" title={durationLabel}><Clock3 size={13} aria-hidden="true" /><strong>{formatTime(durationSeconds)}</strong></span>
    <span className="editing-export-summary-item" title={clipsLabel}><Film size={13} aria-hidden="true" /><strong>{clips.length}</strong></span>
    <span className="editing-export-summary-item editing-export-summary-canvas" title={resolutionLabel}><MonitorPlay size={13} aria-hidden="true" /><strong>{resolution}</strong><small>{ratio}</small></span>
    <span className="editing-export-summary-item" title={audioLabel}>{mutedClipCount > 0 ? <VolumeX size={13} aria-hidden="true" /> : <Volume2 size={13} aria-hidden="true" />}<strong>{audioValue}</strong></span>
  </div>
}
