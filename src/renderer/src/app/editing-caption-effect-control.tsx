import { Sparkles } from 'lucide-react'
import { EDITING_CAPTION_EFFECT_IDS } from '../../../core/editing/caption-effects'
import type { EditingCaptionEffect } from '../../../shared/editing-types'

type Props = {
  title: string
  names: Record<EditingCaptionEffect, string>
  value: EditingCaptionEffect
  onChange: (value: EditingCaptionEffect) => void
}

export function EditingCaptionEffectControl({ title, names, value, onChange }: Props): React.ReactElement {
  return <details className="editing-caption-effect-control" data-testid="editing-caption-effect-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-caption-effect-summary"><Sparkles size={14} aria-hidden="true" /><span>{title}</span></summary>
    <div className="editing-caption-effect-popover">
      <div className="editing-caption-effect-options" role="group" aria-label={title}>
        {EDITING_CAPTION_EFFECT_IDS.map((effect) => <button key={effect} className={`editing-caption-effect-option is-${effect} ${effect === value ? 'is-active' : ''}`} type="button" onClick={() => onChange(effect)} aria-pressed={effect === value} data-testid={`editing-caption-effect-${effect}`}>{names[effect]}</button>)}
      </div>
    </div>
  </details>
}
