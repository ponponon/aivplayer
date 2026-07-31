import { useState } from 'react'
import { EDITING_CLIP_MOTION_DEFAULT_DURATION, EDITING_CLIP_MOTION_MAX_DURATION, EDITING_CLIP_MOTION_MIN_DURATION, EDITING_CLIP_MOTIONS, getEditingClipMotion } from '../../../core/editing/clip-motion'
import type { EditingGraphicMotion, EditingVideoClip } from '../../../shared/editing-types'

type EditingClipMotionControlProps = {
  clip: EditingVideoClip | null
  enterLabel: string
  exitLabel: string
  durationLabel: string
  motionLabels: Record<EditingGraphicMotion, string>
  onChange: (patch: Partial<Pick<EditingVideoClip, 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>) => void
}

export function EditingClipMotionControl({ clip, enterLabel, exitLabel, durationLabel, motionLabels, onChange }: EditingClipMotionControlProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const motion = getEditingClipMotion(clip ?? {})
  const summary = `${motionLabels[motion.enterMotion]} / ${motionLabels[motion.exitMotion]}`
  return <details className="editing-clip-motion-control" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} data-testid="editing-clip-motion-control">
    <summary className="editing-clip-motion-summary" title={`${enterLabel} / ${exitLabel}`}><span>{enterLabel} / {exitLabel}</span><strong>{summary}</strong></summary>
    <div className="editing-clip-motion-popover" onClick={(event) => event.stopPropagation()}>
      <div className="editing-clip-motion-group" role="group" aria-label={enterLabel}>
        <span className="editing-clip-motion-group-label">{enterLabel}</span>
        <div className="editing-clip-motion-options">
          {EDITING_CLIP_MOTIONS.map((value) => <button className={`editing-clip-motion-option ${motion.enterMotion === value ? 'is-active' : ''}`} key={`enter-${value}`} type="button" onClick={() => onChange({ enterMotion: value })} data-testid={`editing-clip-motion-enter-${value}`}>{motionLabels[value]}</button>)}
        </div>
      </div>
      <div className="editing-clip-motion-group" role="group" aria-label={exitLabel}>
        <span className="editing-clip-motion-group-label">{exitLabel}</span>
        <div className="editing-clip-motion-options">
          {EDITING_CLIP_MOTIONS.map((value) => <button className={`editing-clip-motion-option ${motion.exitMotion === value ? 'is-active' : ''}`} key={`exit-${value}`} type="button" onClick={() => onChange({ exitMotion: value })} data-testid={`editing-clip-motion-exit-${value}`}>{motionLabels[value]}</button>)}
        </div>
      </div>
      <label className="editing-clip-motion-duration">
        <span>{durationLabel}</span>
        <input type="range" min={EDITING_CLIP_MOTION_MIN_DURATION * 1000} max={EDITING_CLIP_MOTION_MAX_DURATION * 1000} step="50" value={motion.durationSeconds * 1000 || EDITING_CLIP_MOTION_DEFAULT_DURATION * 1000} onChange={(event) => onChange({ motionDurationSeconds: Number(event.currentTarget.value) / 1000 })} data-testid="editing-clip-motion-duration" />
        <output>{Math.round(motion.durationSeconds * 1000)}ms</output>
      </label>
    </div>
  </details>
}
