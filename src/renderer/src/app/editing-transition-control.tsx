import { useState } from 'react'
import { EDITING_TRANSITION_DEFAULT_DURATION, EDITING_TRANSITION_MAX_DURATION, EDITING_TRANSITION_MIN_DURATION, type EditingClipTransition, type EditingClipTransitionType, type EditingVideoClip } from '../../../shared/editing-types'
import { EDITING_TRANSITION_TYPES, getEditingClipTransition } from '../../../core/editing/transition-operations'

type EditingTransitionControlProps = {
  clip: EditingVideoClip | null
  isFirstClip: boolean
  title: string
  noneLabel: string
  transitionLabels: Record<EditingClipTransitionType, string>
  durationLabel: string
  onChange: (transition: EditingClipTransition | null) => void
}

function transitionValue(clip: EditingVideoClip | null): EditingClipTransition {
  return getEditingClipTransition(clip ?? {}) ?? { type: 'fade', durationSeconds: EDITING_TRANSITION_DEFAULT_DURATION }
}

export function EditingTransitionControl({ clip, isFirstClip, title, noneLabel, transitionLabels, durationLabel, onChange }: EditingTransitionControlProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const transition = getEditingClipTransition(clip ?? {})
  const active = Boolean(transition)
  const value = transitionValue(clip)
  return <details className="editing-transition-control" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} data-testid="editing-transition-control">
    <summary className="editing-transition-summary" title={isFirstClip ? noneLabel : title}>
      <span>{title}</span>
      <strong>{active ? `${Math.round(value.durationSeconds * 1000)}ms` : noneLabel}</strong>
    </summary>
    <div className="editing-transition-popover" onClick={(event) => event.stopPropagation()}>
      <div className="editing-transition-options" role="group" aria-label={title}>
        <button className={`editing-transition-option ${!active ? 'is-active' : ''}`} type="button" disabled={isFirstClip} onClick={() => onChange(null)} data-testid="editing-transition-none">{noneLabel}</button>
        {EDITING_TRANSITION_TYPES.map((type) => <button key={type} className={`editing-transition-option ${active && value.type === type ? 'is-active' : ''}`} type="button" disabled={isFirstClip} onClick={() => onChange({ type, durationSeconds: value.durationSeconds })} data-testid={`editing-transition-${type}`}>{transitionLabels[type]}</button>)}
      </div>
      <label className="editing-transition-duration">
        <span>{durationLabel}</span>
        <input type="range" min={EDITING_TRANSITION_MIN_DURATION * 1000} max={EDITING_TRANSITION_MAX_DURATION * 1000} step="50" value={value.durationSeconds * 1000} disabled={isFirstClip || !active} onChange={(event) => onChange({ type: value.type, durationSeconds: Number(event.currentTarget.value) / 1000 })} data-testid="editing-transition-duration" />
        <output>{Math.round(value.durationSeconds * 1000)}ms</output>
      </label>
    </div>
  </details>
}
