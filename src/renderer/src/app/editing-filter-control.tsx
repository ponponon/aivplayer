import type { EditingClipFilter, EditingVideoClip } from '../../../shared/editing-types'
import { getEditingClipFilter, isEditingClipFilterNeutral } from '../../../core/editing/filter-operations'

type FilterKey = keyof Required<EditingClipFilter>
type EditingFilterControlProps = {
  clip: EditingVideoClip | null
  title: string
  brightnessLabel: string
  contrastLabel: string
  saturationLabel: string
  resetLabel: string
  onChange: (filter: EditingClipFilter) => void
}

export function EditingFilterControl({ clip, title, brightnessLabel, contrastLabel, saturationLabel, resetLabel, onChange }: EditingFilterControlProps): React.ReactElement | null {
  if (!clip) return null
  const values = getEditingClipFilter(clip)
  const fields: [FilterKey, string][] = [['brightness', brightnessLabel], ['contrast', contrastLabel], ['saturate', saturationLabel]]
  return <details className="editing-filter-control" onClick={(event) => event.stopPropagation()} data-testid="editing-filter-control">
    <summary className="editing-filter-summary"><span>{title}</span>{isEditingClipFilterNeutral(clip) ? null : <strong>●</strong>}</summary>
    <div className="editing-filter-popover">
      {fields.map(([key, label]) => <label className="editing-filter-field" key={key}><span>{label}</span><input type="range" min="50" max="150" step="1" value={Math.round(values[key] * 100)} onChange={(event) => onChange({ ...values, [key]: Number(event.currentTarget.value) / 100 })} aria-label={label} /><output>{Math.round(values[key] * 100)}%</output></label>)}
      {!isEditingClipFilterNeutral(clip) ? <button className="editing-filter-reset" type="button" onClick={() => onChange({})} data-testid="editing-filter-reset">{resetLabel}</button> : null}
    </div>
  </details>
}
