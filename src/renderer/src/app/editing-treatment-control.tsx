import { useEffect, useRef, useState } from 'react'
import type { EditingClipTreatment, EditingTreatmentAnchor, EditingVideoClip } from '../../../shared/editing-types'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale } from '../../../core/editing/treatment-operations'

type EditingTreatmentControlProps = {
  clip: EditingVideoClip | null
  title: string
  fullLabel: string
  punchInLabel: string
  scaleLabel: string
  focusLabel: string
  focusLeft: string
  focusCenter: string
  focusRight: string
  onPreview: (treatment: EditingClipTreatment, scale?: number, anchor?: EditingTreatmentAnchor) => void
  onChange: (treatment: EditingClipTreatment, scale?: number, anchor?: EditingTreatmentAnchor) => void
}

export function EditingTreatmentControl({ clip, title, fullLabel, punchInLabel, scaleLabel, focusLabel, focusLeft, focusCenter, focusRight, onPreview, onChange }: EditingTreatmentControlProps): React.ReactElement | null {
  const projectScale = clip ? getEditingClipTreatmentScale(clip) : getEditingClipTreatmentScale({})
  const [draftScale, setDraftScale] = useState(projectScale)
  const draftScaleRef = useRef(draftScale)
  const interactionRef = useRef(false)
  useEffect(() => {
    setDraftScale(projectScale)
    draftScaleRef.current = projectScale
    interactionRef.current = false
  }, [clip?.id, projectScale])
  if (!clip) return null
  const treatment = getEditingClipTreatment(clip)
  const scale = projectScale
  const anchor = getEditingClipTreatmentAnchor(clip)
  const commitScale = (): void => {
    if (!interactionRef.current) return
    interactionRef.current = false
    onChange('punch-in', draftScaleRef.current, anchor)
  }
  const updateScalePreview = (value: number): void => {
    interactionRef.current = true
    draftScaleRef.current = value
    setDraftScale(value)
    onPreview('punch-in', value, anchor)
  }
  return <div className="editing-treatment-control" onClick={(event) => event.stopPropagation()} data-testid="editing-treatment-control">
    <span className="editing-treatment-title">{title}</span>
    <div className="editing-treatment-options" role="group" aria-label={title}>
      <button className={`editing-treatment-option ${treatment === 'full' ? 'is-active' : ''}`} type="button" aria-pressed={treatment === 'full'} onClick={() => onChange('full')} data-testid="editing-treatment-full">{fullLabel}</button>
      <button className={`editing-treatment-option ${treatment === 'punch-in' ? 'is-active' : ''}`} type="button" aria-pressed={treatment === 'punch-in'} onClick={() => onChange('punch-in', scale, anchor)} data-testid="editing-treatment-punch-in">{punchInLabel}</button>
    </div>
    {treatment === 'punch-in' ? <><div className="editing-treatment-focus" role="group" aria-label={focusLabel}><button className={`editing-treatment-focus-button ${anchor === 'left' ? 'is-active' : ''}`} type="button" aria-label={focusLeft} aria-pressed={anchor === 'left'} onClick={() => onChange('punch-in', scale, 'left')} data-testid="editing-treatment-anchor-left">←</button><button className={`editing-treatment-focus-button ${anchor === 'center' ? 'is-active' : ''}`} type="button" aria-label={focusCenter} aria-pressed={anchor === 'center'} onClick={() => onChange('punch-in', scale, 'center')} data-testid="editing-treatment-anchor-center">●</button><button className={`editing-treatment-focus-button ${anchor === 'right' ? 'is-active' : ''}`} type="button" aria-label={focusRight} aria-pressed={anchor === 'right'} onClick={() => onChange('punch-in', scale, 'right')} data-testid="editing-treatment-anchor-right">→</button></div><label className="editing-treatment-scale"><span>{scaleLabel}</span><input type="range" min="1" max="2.5" step="0.05" value={draftScale} onChange={(event) => updateScalePreview(Number(event.currentTarget.value))} onPointerDown={() => { interactionRef.current = true }} onPointerUp={commitScale} onPointerCancel={commitScale} onKeyDown={() => { interactionRef.current = true }} onKeyUp={commitScale} onBlur={commitScale} aria-label={scaleLabel} /><output>{Math.round(draftScale * 100)}%</output></label></> : null}
  </div>
}
