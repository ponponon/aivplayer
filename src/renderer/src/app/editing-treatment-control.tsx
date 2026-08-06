import { useEffect, useRef, useState } from 'react'
import type { EditingClipTreatment, EditingTreatmentAnchor, EditingVideoClip } from '../../../shared/editing-types'
import { getEditingClipTreatment, getEditingClipTreatmentAnchor, getEditingClipTreatmentScale, getEditingClipTreatmentSize } from '../../../core/editing/treatment-operations'

type EditingTreatmentControlProps = {
  clip: EditingVideoClip | null
  title: string
  fullLabel: string
  punchInLabel: string
  cornerBottomRightLabel: string
  cornerTopLeftLabel: string
  splitLeftLabel: string
  splitRightLabel: string
  sizeLabel: string
  scaleLabel: string
  focusLabel: string
  focusLeft: string
  focusCenter: string
  focusRight: string
  onPreview: (treatment: EditingClipTreatment, scale?: number, anchor?: EditingTreatmentAnchor, size?: number) => void
  onChange: (treatment: EditingClipTreatment, scale?: number, anchor?: EditingTreatmentAnchor, size?: number) => void
}

function TreatmentGlyph({ treatment }: { treatment: EditingClipTreatment }): React.ReactElement {
  const compact = treatment === 'corner-br' || treatment === 'corner-tl' || treatment === 'split-left' || treatment === 'split-right'
  return <svg className={`editing-treatment-glyph is-${treatment}`} viewBox="0 0 48 32" aria-hidden="true">
    <rect className="editing-treatment-glyph-canvas" x="1" y="1" width="46" height="30" rx="4" />
    {treatment === 'full' ? <rect className="editing-treatment-glyph-video" x="4" y="4" width="40" height="24" rx="2" /> : null}
    {treatment === 'punch-in' ? <rect className="editing-treatment-glyph-video" x="-5" y="-3" width="58" height="38" rx="2" /> : null}
    {compact && treatment.startsWith('corner') ? <>
      <rect className="editing-treatment-glyph-copy" x="6" y={treatment === 'corner-br' ? '4' : '19'} width="19" height="3" rx="1.5" />
      <rect className="editing-treatment-glyph-copy" x="6" y={treatment === 'corner-br' ? '10' : '25'} width="14" height="2" rx="1" />
      <rect className="editing-treatment-glyph-video" x={treatment === 'corner-br' ? '28' : '4'} y={treatment === 'corner-br' ? '17' : '4'} width="16" height="11" rx="2" />
    </> : null}
    {compact && treatment.startsWith('split') ? <>
      <rect className="editing-treatment-glyph-video" x={treatment === 'split-left' ? '3' : '25'} y="4" width="20" height="24" rx="2" />
      <rect className="editing-treatment-glyph-copy" x={treatment === 'split-left' ? '27' : '5'} y="12" width="14" height="3" rx="1.5" />
      <rect className="editing-treatment-glyph-copy" x={treatment === 'split-left' ? '27' : '5'} y="18" width="10" height="2" rx="1" />
    </> : null}
  </svg>
}

export function EditingTreatmentControl({ clip, title, fullLabel, punchInLabel, cornerBottomRightLabel, cornerTopLeftLabel, splitLeftLabel, splitRightLabel, sizeLabel, scaleLabel, focusLabel, focusLeft, focusCenter, focusRight, onPreview, onChange }: EditingTreatmentControlProps): React.ReactElement | null {
  const projectScale = clip ? getEditingClipTreatmentScale(clip) : getEditingClipTreatmentScale({})
  const projectSize = clip ? getEditingClipTreatmentSize(clip) : 0
  const [draftScale, setDraftScale] = useState(projectScale)
  const [draftSize, setDraftSize] = useState(projectSize)
  const draftScaleRef = useRef(draftScale)
  const draftSizeRef = useRef(draftSize)
  const interactionRef = useRef(false)
  useEffect(() => {
    setDraftScale(projectScale)
    draftScaleRef.current = projectScale
    setDraftSize(projectSize)
    draftSizeRef.current = projectSize
    interactionRef.current = false
  }, [clip?.id, projectScale, projectSize])
  if (!clip) return null
  const treatment = getEditingClipTreatment(clip)
  const scale = projectScale
  const anchor = getEditingClipTreatmentAnchor(clip)
  const selectTreatment = (nextTreatment: EditingClipTreatment): void => {
    if (nextTreatment === 'full') onChange('full')
    else if (nextTreatment === 'punch-in') onChange('punch-in', scale, anchor)
    else onChange(nextTreatment, undefined, undefined, getEditingClipTreatmentSize({ treatment: nextTreatment }))
  }
  const commitScale = (): void => {
    if (!interactionRef.current) return
    interactionRef.current = false
    if (treatment === 'punch-in') onChange('punch-in', draftScaleRef.current, anchor)
    else onChange(treatment, undefined, undefined, draftSizeRef.current)
  }
  const updateScalePreview = (value: number): void => {
    interactionRef.current = true
    draftScaleRef.current = value
    setDraftScale(value)
    onPreview('punch-in', value, anchor)
  }
  const updateSizePreview = (value: number): void => {
    interactionRef.current = true
    draftSizeRef.current = value
    setDraftSize(value)
    onPreview(treatment, undefined, undefined, value)
  }
  const options: { treatment: EditingClipTreatment; label: string }[] = [
    { treatment: 'full', label: fullLabel },
    { treatment: 'punch-in', label: punchInLabel },
    { treatment: 'corner-br', label: cornerBottomRightLabel },
    { treatment: 'corner-tl', label: cornerTopLeftLabel },
    { treatment: 'split-left', label: splitLeftLabel },
    { treatment: 'split-right', label: splitRightLabel }
  ]
  const isCompact = treatment === 'corner-br' || treatment === 'corner-tl' || treatment === 'split-left' || treatment === 'split-right'
  return <div className="editing-treatment-control" onClick={(event) => event.stopPropagation()} data-testid="editing-treatment-control">
    <span className="editing-treatment-title">{title}</span>
    <div className="editing-treatment-options" role="group" aria-label={title}>
      {options.map(({ treatment: optionTreatment, label }) => <button className={`editing-treatment-option ${treatment === optionTreatment ? 'is-active' : ''}`} key={optionTreatment} type="button" aria-label={label} aria-pressed={treatment === optionTreatment} onClick={() => selectTreatment(optionTreatment)} data-testid={`editing-treatment-${optionTreatment}`}><TreatmentGlyph treatment={optionTreatment} /><span>{label}</span></button>)}
    </div>
    {treatment === 'punch-in' ? <><div className="editing-treatment-focus" role="group" aria-label={focusLabel}><button className={`editing-treatment-focus-button ${anchor === 'left' ? 'is-active' : ''}`} type="button" aria-label={focusLeft} aria-pressed={anchor === 'left'} onClick={() => onChange('punch-in', scale, 'left')} data-testid="editing-treatment-anchor-left">←</button><button className={`editing-treatment-focus-button ${anchor === 'center' ? 'is-active' : ''}`} type="button" aria-label={focusCenter} aria-pressed={anchor === 'center'} onClick={() => onChange('punch-in', scale, 'center')} data-testid="editing-treatment-anchor-center">●</button><button className={`editing-treatment-focus-button ${anchor === 'right' ? 'is-active' : ''}`} type="button" aria-label={focusRight} aria-pressed={anchor === 'right'} onClick={() => onChange('punch-in', scale, 'right')} data-testid="editing-treatment-anchor-right">→</button></div><label className="editing-treatment-scale"><span>{scaleLabel}</span><input type="range" min="1" max="2.5" step="0.05" value={draftScale} onChange={(event) => updateScalePreview(Number(event.currentTarget.value))} onPointerDown={(event) => { interactionRef.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerUp={commitScale} onPointerCancel={commitScale} onLostPointerCapture={commitScale} onKeyDown={() => { interactionRef.current = true }} onKeyUp={commitScale} onBlur={commitScale} aria-label={scaleLabel} /><output>{Math.round(draftScale * 100)}%</output></label></> : null}
    {isCompact ? <label className="editing-treatment-scale"><span>{sizeLabel}</span><input type="range" min="0" max="100" step="1" value={draftSize} onChange={(event) => updateSizePreview(Number(event.currentTarget.value))} onPointerDown={(event) => { interactionRef.current = true; event.currentTarget.setPointerCapture(event.pointerId) }} onPointerUp={commitScale} onPointerCancel={commitScale} onLostPointerCapture={commitScale} onKeyDown={() => { interactionRef.current = true }} onKeyUp={commitScale} onBlur={commitScale} aria-label={sizeLabel} /><output>{Math.round(draftSize)}%</output></label> : null}
  </div>
}
