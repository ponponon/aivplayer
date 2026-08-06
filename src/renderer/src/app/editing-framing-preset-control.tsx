import { LayoutTemplate } from 'lucide-react'
import { useRef } from 'react'
import { EDITING_FRAMING_PRESETS, isEditingFramingPresetActive, isEditingFramingPresetAllowed, type EditingFramingPresetId } from '../../../core/editing/framing-presets'
import type { EditingFramingOrientation } from '../../../core/editing/framing-orientation'
import type { EditingVideoClip } from '../../../shared/editing-types'
import { TreatmentGlyph } from './editing-treatment-control'

type Props = {
  title: string
  targetLabel: (count: number) => string
  orientation: EditingFramingOrientation
  orientationHint: string
  names: Record<EditingFramingPresetId, string>
  selectedClip: EditingVideoClip | null
  selectedClips: readonly EditingVideoClip[]
  onApply: (clipIds: readonly string[], presetId: EditingFramingPresetId) => void
}

export function EditingFramingPresetControl({ title, targetLabel, orientation, orientationHint, names, selectedClip, selectedClips, onApply }: Props): React.ReactElement | null {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const targets = selectedClips.length > 0 ? selectedClips : selectedClip ? [selectedClip] : []
  if (targets.length === 0) return null
  const targetIds = targets.map((clip) => clip.id)
  const applyPreset = (presetId: EditingFramingPresetId): void => {
    onApply(targetIds, presetId)
    if (detailsRef.current) detailsRef.current.open = false
  }
  return <details ref={detailsRef} className="editing-framing-preset-control" data-testid="editing-framing-preset-control" data-framing-orientation={orientation} onClick={(event) => event.stopPropagation()}>
    <summary className="editing-framing-preset-summary"><LayoutTemplate size={14} aria-hidden="true" /><span>{title}</span>{targets.length > 1 ? <small>{targetLabel(targets.length)}</small> : null}</summary>
    <div className="editing-framing-preset-popover">
      <div className="editing-framing-preset-heading"><strong>{title}</strong><small>{targetLabel(targets.length)}</small></div>
      <div className="editing-framing-preset-options" role="group" aria-label={title}>
        {EDITING_FRAMING_PRESETS.map((preset) => {
          const allowed = isEditingFramingPresetAllowed(preset, orientation)
          const active = targets.every((clip) => isEditingFramingPresetActive(clip, preset))
          const label = names[preset.id]
          return <button key={preset.id} className={`editing-framing-preset-option ${active ? 'is-active' : ''}`} type="button" disabled={!allowed} aria-label={label} aria-pressed={active} title={allowed ? label : `${label} · ${orientationHint}`} data-orientation-allowed={allowed ? 'true' : 'false'} data-testid={`editing-framing-preset-${preset.id}`} onClick={() => applyPreset(preset.id)}><TreatmentGlyph treatment={preset.treatment} /><span>{label}</span></button>
        })}
      </div>
    </div>
  </details>
}
