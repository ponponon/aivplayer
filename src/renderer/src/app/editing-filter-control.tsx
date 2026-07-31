import { useEffect, useRef, useState } from 'react'
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
  onPreview: (filter: EditingClipFilter) => void
  onChange: (filter: EditingClipFilter) => void
}

export function EditingFilterControl({ clip, title, brightnessLabel, contrastLabel, saturationLabel, resetLabel, onPreview, onChange }: EditingFilterControlProps): React.ReactElement | null {
  const values = clip ? getEditingClipFilter(clip) : getEditingClipFilter({})
  const [draftValues, setDraftValues] = useState<Required<EditingClipFilter>>(values)
  const draftValuesRef = useRef(draftValues)
  const interactionRef = useRef(false)
  useEffect(() => {
    setDraftValues(values)
    draftValuesRef.current = values
    interactionRef.current = false
  }, [clip?.id, values.brightness, values.contrast, values.saturate])
  if (!clip) return null
  const fields: [FilterKey, string][] = [['brightness', brightnessLabel], ['contrast', contrastLabel], ['saturate', saturationLabel]]
  const commitPreview = (): void => {
    if (!interactionRef.current) return
    interactionRef.current = false
    onChange(draftValuesRef.current)
  }
  const updatePreview = (key: FilterKey, value: number): void => {
    interactionRef.current = true
    const nextValues = { ...draftValuesRef.current, [key]: value }
    draftValuesRef.current = nextValues
    setDraftValues(nextValues)
    onPreview(nextValues)
  }
  const resetFilter = (): void => {
    const nextValues = getEditingClipFilter({})
    interactionRef.current = false
    draftValuesRef.current = nextValues
    setDraftValues(nextValues)
    onChange({})
  }
  const isDraftNeutral = isEditingClipFilterNeutral({ filter: draftValues })
  return <details className="editing-filter-control" onClick={(event) => event.stopPropagation()} data-testid="editing-filter-control">
    <summary className="editing-filter-summary"><span>{title}</span>{isDraftNeutral ? null : <strong>●</strong>}</summary>
    <div className="editing-filter-popover">
      {fields.map(([key, label]) => <label className="editing-filter-field" key={key}><span>{label}</span><input type="range" min="50" max="150" step="1" value={Math.round(draftValues[key] * 100)} onChange={(event) => updatePreview(key, Number(event.currentTarget.value) / 100)} onPointerDown={() => { interactionRef.current = true }} onPointerUp={commitPreview} onPointerCancel={commitPreview} onKeyDown={() => { interactionRef.current = true }} onKeyUp={commitPreview} onBlur={commitPreview} aria-label={label} /><output>{Math.round(draftValues[key] * 100)}%</output></label>)}
      {!isDraftNeutral ? <button className="editing-filter-reset" type="button" onClick={resetFilter} data-testid="editing-filter-reset">{resetLabel}</button> : null}
    </div>
  </details>
}
