import { Volume2, VolumeX } from 'lucide-react'
import type { EditingVideoClip } from '../../../shared/editing-types'
import { getEditingClipVolume, isEditingClipMuted } from '../../../core/editing/audio-operations'

type EditingAudioControlProps = {
  clip: EditingVideoClip | null
  volumeLabel: string
  muteLabel: string
  unmuteLabel: string
  onVolumeChange: (volume: number) => void
  onToggleMute: () => void
}

export function EditingAudioControl({ clip, volumeLabel, muteLabel, unmuteLabel, onVolumeChange, onToggleMute }: EditingAudioControlProps): React.ReactElement | null {
  if (!clip) return null
  const volume = getEditingClipVolume(clip)
  const muted = isEditingClipMuted(clip)
  const audioActionLabel = muted ? unmuteLabel : muteLabel
  return <div className="editing-audio-control" onClick={(event) => event.stopPropagation()}>
    <button className="editing-audio-toggle" type="button" onClick={onToggleMute} title={audioActionLabel} aria-label={audioActionLabel} aria-pressed={muted}>{muted ? <VolumeX size={14} /> : <Volume2 size={14} />}</button>
    <input className="editing-audio-range" type="range" min="0" max="1" step="0.01" value={muted ? 0 : volume} onChange={(event) => onVolumeChange(Number(event.currentTarget.value))} aria-label={volumeLabel} />
    <span className="editing-audio-value">{Math.round((muted ? 0 : volume) * 100)}%</span>
  </div>
}
