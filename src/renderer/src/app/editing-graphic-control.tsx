import { useRef, useState } from 'react'
import type { EditingGraphicPosition, EditingGraphicStyle } from '../../../shared/editing-types'

type EditingGraphicControlProps = {
  title: string
  textLabel: string
  textPlaceholder: string
  addLabel: string
  positionLabel: string
  styleLabel: string
  titleStyleLabel: string
  labelStyleLabel: string
  durationLabel: string
  positionLabels: Record<EditingGraphicPosition, string>
  currentTime: number
  timelineDuration: number
  onAdd: (text: string, options: { position: EditingGraphicPosition; style: EditingGraphicStyle; durationSeconds: number }) => void
}

export function EditingGraphicControl({ title, textLabel, textPlaceholder, addLabel, positionLabel, styleLabel, titleStyleLabel, labelStyleLabel, durationLabel, positionLabels, currentTime, timelineDuration, onAdd }: EditingGraphicControlProps): React.ReactElement {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [text, setText] = useState('')
  const [position, setPosition] = useState<EditingGraphicPosition>('center')
  const [style, setStyle] = useState<EditingGraphicStyle>('title')
  const [durationSeconds, setDurationSeconds] = useState(3)
  const maxDuration = Math.max(0.2, Math.min(8, timelineDuration - currentTime))
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!text.trim()) return
    onAdd(text, { position, style, durationSeconds: Math.min(durationSeconds, maxDuration) })
    setText('')
    if (detailsRef.current) detailsRef.current.open = false
  }
  return <details ref={detailsRef} className="editing-graphic-control" onClick={(event) => event.stopPropagation()} data-testid="editing-graphic-control">
    <summary className="editing-graphic-summary"><span>{title}</span></summary>
    <form className="editing-graphic-popover" onSubmit={submit}>
      <label className="editing-graphic-field"><span>{textLabel}</span><input value={text} onChange={(event) => setText(event.currentTarget.value)} placeholder={textPlaceholder} data-testid="editing-graphic-text" /></label>
      <label className="editing-graphic-field"><span>{positionLabel}</span><select value={position} onChange={(event) => setPosition(event.currentTarget.value as EditingGraphicPosition)}>{(Object.keys(positionLabels) as EditingGraphicPosition[]).map((key) => <option key={key} value={key}>{positionLabels[key]}</option>)}</select></label>
      <label className="editing-graphic-field"><span>{styleLabel}</span><select value={style} onChange={(event) => setStyle(event.currentTarget.value as EditingGraphicStyle)}><option value="title">{titleStyleLabel}</option><option value="label">{labelStyleLabel}</option></select></label>
      <label className="editing-graphic-duration"><span>{durationLabel}</span><input type="range" min="0.2" max={maxDuration} step="0.1" value={Math.min(durationSeconds, maxDuration)} onChange={(event) => setDurationSeconds(Number(event.currentTarget.value))} /><output>{Math.min(durationSeconds, maxDuration).toFixed(1)}s</output></label>
      <button className="editing-graphic-add" type="submit" disabled={!text.trim() || timelineDuration - currentTime < 0.2} data-testid="editing-graphic-add">{addLabel}</button>
    </form>
  </details>
}
