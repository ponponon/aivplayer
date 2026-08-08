import { useEffect, useRef, useState } from 'react'
import { EDITING_GRAPHIC_MOTION_MAX_DURATION, EDITING_GRAPHIC_MOTION_MIN_DURATION, EDITING_GRAPHIC_MOTIONS, getEditingGraphicMotion } from '../../../core/editing/graphic-motion'
import type { EditingGraphic, EditingGraphicMotion, EditingGraphicPosition, EditingGraphicStyle } from '../../../shared/editing-types'

type EditingGraphicEditorProps = {
  graphic: EditingGraphic | null
  title: string
  textLabel: string
  textPlaceholder: string
  saveLabel: string
  positionLabel: string
  styleLabel: string
  titleStyleLabel: string
  labelStyleLabel: string
  durationLabel: string
  enterLabel: string
  exitLabel: string
  motionDurationLabel: string
  motionLabels: Record<EditingGraphicMotion, string>
  assetSaveLabel: string
  positionLabels: Record<EditingGraphicPosition, string>
  timelineDuration: number
  onSaveAsset: (graphic: EditingGraphic) => void
  onUpdate: (graphicId: string, patch: Partial<Pick<EditingGraphic, 'text' | 'position' | 'style' | 'durationSeconds' | 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>) => void
}

export function EditingGraphicEditor({ graphic, title, textLabel, textPlaceholder, saveLabel, positionLabel, styleLabel, titleStyleLabel, labelStyleLabel, durationLabel, enterLabel, exitLabel, motionDurationLabel, motionLabels, assetSaveLabel, positionLabels, timelineDuration, onSaveAsset, onUpdate }: EditingGraphicEditorProps): React.ReactElement | null {
  const [isOpen, setIsOpen] = useState(true)
  const [text, setText] = useState(graphic?.text ?? '')
  const [position, setPosition] = useState<EditingGraphicPosition>(graphic?.position ?? 'center')
  const [style, setStyle] = useState<EditingGraphicStyle>(graphic?.style ?? 'title')
  const [durationSeconds, setDurationSeconds] = useState(graphic?.durationSeconds ?? 0.2)
  const [enterMotion, setEnterMotion] = useState<EditingGraphicMotion>(graphic ? getEditingGraphicMotion(graphic).enterMotion : 'none')
  const [exitMotion, setExitMotion] = useState<EditingGraphicMotion>(graphic ? getEditingGraphicMotion(graphic).exitMotion : 'none')
  const [motionDurationSeconds, setMotionDurationSeconds] = useState(graphic ? getEditingGraphicMotion(graphic).durationSeconds : 0.35)
  const previousGraphicIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (!graphic) { previousGraphicIdRef.current = null; return }
    const selectionChanged = previousGraphicIdRef.current !== graphic.id
    previousGraphicIdRef.current = graphic.id
    setText(graphic.text)
    setPosition(graphic.position)
    setStyle(graphic.style)
    setDurationSeconds(graphic.durationSeconds)
    const motion = getEditingGraphicMotion(graphic)
    setEnterMotion(motion.enterMotion)
    setExitMotion(motion.exitMotion)
    setMotionDurationSeconds(motion.durationSeconds)
    if (selectionChanged) setIsOpen(true)
  }, [graphic])

  if (!graphic) return null
  const maxDuration = Math.max(0.2, Math.min(8, timelineDuration - graphic.startSeconds))
  const value = Math.min(durationSeconds, maxDuration)
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!text.trim()) return
    onUpdate(graphic.id, { text, position, style, durationSeconds: value, enterMotion, exitMotion, motionDurationSeconds })
  }

  return <details className="editing-graphic-editor" open={isOpen} onToggle={(event) => setIsOpen(event.currentTarget.open)} data-testid="editing-graphic-editor" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-graphic-summary"><span>{title}</span></summary>
    <form className="editing-graphic-popover" onSubmit={submit}>
      <label className="editing-graphic-field"><span>{textLabel}</span><input value={text} onChange={(event) => setText(event.currentTarget.value)} placeholder={textPlaceholder} data-testid="editing-graphic-edit-text" /></label>
      <label className="editing-graphic-field"><span>{positionLabel}</span><select value={position} onChange={(event) => setPosition(event.currentTarget.value as EditingGraphicPosition)}>{(Object.keys(positionLabels) as EditingGraphicPosition[]).map((key) => <option key={key} value={key}>{positionLabels[key]}</option>)}</select></label>
      <label className="editing-graphic-field"><span>{styleLabel}</span><select value={style} onChange={(event) => setStyle(event.currentTarget.value as EditingGraphicStyle)}><option value="title">{titleStyleLabel}</option><option value="label">{labelStyleLabel}</option></select></label>
      <label className="editing-graphic-duration"><span>{durationLabel}</span><input type="range" min="0.2" max={maxDuration} step="0.1" value={value} onChange={(event) => setDurationSeconds(Number(event.currentTarget.value))} /><output>{value.toFixed(1)}s</output></label>
      <label className="editing-graphic-field"><span>{enterLabel}</span><select value={enterMotion} onChange={(event) => setEnterMotion(event.currentTarget.value as EditingGraphicMotion)} data-testid="editing-graphic-edit-enter">{EDITING_GRAPHIC_MOTIONS.map((key) => <option key={key} value={key}>{motionLabels[key]}</option>)}</select></label>
      <label className="editing-graphic-field"><span>{exitLabel}</span><select value={exitMotion} onChange={(event) => setExitMotion(event.currentTarget.value as EditingGraphicMotion)} data-testid="editing-graphic-edit-exit">{EDITING_GRAPHIC_MOTIONS.map((key) => <option key={key} value={key}>{motionLabels[key]}</option>)}</select></label>
      <label className="editing-graphic-duration"><span>{motionDurationLabel}</span><input type="range" min={EDITING_GRAPHIC_MOTION_MIN_DURATION} max={EDITING_GRAPHIC_MOTION_MAX_DURATION} step="0.05" value={motionDurationSeconds} onChange={(event) => setMotionDurationSeconds(Number(event.currentTarget.value))} data-testid="editing-graphic-edit-motion-duration" /><output>{motionDurationSeconds.toFixed(2)}s</output></label>
      <button className="editing-graphic-save-asset" type="button" onClick={() => onSaveAsset({ ...graphic, text, position, style, durationSeconds: value })} data-testid="editing-graphic-save-asset">{assetSaveLabel}</button>
      <button className="editing-graphic-add" type="submit" disabled={!text.trim()} data-testid="editing-graphic-save">{saveLabel}</button>
    </form>
  </details>
}
