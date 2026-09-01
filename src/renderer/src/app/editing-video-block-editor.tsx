import { AppSelect } from '../../../shared/app-select'
import { useEffect, useState } from 'react'
import { getEditingVideoBlockBorderRadius, getEditingVideoBlockBorderWidth, getEditingVideoBlockMotion, getEditingVideoBlockSize, EDITING_VIDEO_BLOCK_MAX_BORDER_RADIUS, EDITING_VIDEO_BLOCK_MAX_BORDER_WIDTH, EDITING_VIDEO_BLOCK_MAX_SIZE_PERCENT, EDITING_VIDEO_BLOCK_MIN_BORDER_RADIUS, EDITING_VIDEO_BLOCK_MIN_BORDER_WIDTH, EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT, EDITING_VIDEO_BLOCK_MOTION_MAX_DURATION, EDITING_VIDEO_BLOCK_MOTION_MIN_DURATION, EDITING_VIDEO_BLOCK_MOTIONS } from '../../../core/editing/video-block-operations'
import type { EditingSource, EditingVideoBlock, EditingVideoBlockMotion, EditingVideoBlockPosition } from '../../../shared/editing-types'

type EditingVideoBlockEditorProps = {
  block: EditingVideoBlock | null
  source: EditingSource | null
  title: string
  positionLabel: string
  positionLabels: Record<EditingVideoBlockPosition, string>
  sourceStartLabel: string
  durationLabel: string
  sizeLabel: string
  radiusLabel: string
  borderLabel: string
  enterLabel: string
  exitLabel: string
  motionDurationLabel: string
  motionLabels: Record<EditingVideoBlockMotion, string>
  onUpdate: (blockId: string, patch: Partial<Pick<EditingVideoBlock, 'position' | 'sourceStartSeconds' | 'durationSeconds' | 'sizePercent' | 'borderRadius' | 'borderWidth' | 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>) => void
}

export function EditingVideoBlockEditor({ block, source, title, positionLabel, positionLabels, sourceStartLabel, durationLabel, sizeLabel, radiusLabel, borderLabel, enterLabel, exitLabel, motionDurationLabel, motionLabels, onUpdate }: EditingVideoBlockEditorProps): React.ReactElement | null {
  const [position, setPosition] = useState<EditingVideoBlockPosition>(block?.position ?? 'bottom-right')
  const [sourceStartSeconds, setSourceStartSeconds] = useState(block?.sourceStartSeconds ?? 0)
  const [durationSeconds, setDurationSeconds] = useState(block?.durationSeconds ?? 0.2)
  const [sizePercent, setSizePercent] = useState(block ? getEditingVideoBlockSize(block) : EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT)
  const [borderRadius, setBorderRadius] = useState(block ? getEditingVideoBlockBorderRadius(block) : 0)
  const [borderWidth, setBorderWidth] = useState(block ? getEditingVideoBlockBorderWidth(block) : 0)
  const [enterMotion, setEnterMotion] = useState<EditingVideoBlockMotion>(block ? getEditingVideoBlockMotion(block).enterMotion : 'none')
  const [exitMotion, setExitMotion] = useState<EditingVideoBlockMotion>(block ? getEditingVideoBlockMotion(block).exitMotion : 'none')
  const [motionDurationSeconds, setMotionDurationSeconds] = useState(block ? getEditingVideoBlockMotion(block).durationSeconds : 0.35)

  useEffect(() => {
    if (!block) return
    setPosition(block.position)
    setSourceStartSeconds(block.sourceStartSeconds)
    setDurationSeconds(block.durationSeconds)
    setSizePercent(getEditingVideoBlockSize(block))
    setBorderRadius(getEditingVideoBlockBorderRadius(block))
    setBorderWidth(getEditingVideoBlockBorderWidth(block))
    const motion = getEditingVideoBlockMotion(block)
    setEnterMotion(motion.enterMotion)
    setExitMotion(motion.exitMotion)
    setMotionDurationSeconds(motion.durationSeconds)
  }, [block])

  if (!block || !source) return null
  const maxDuration = Math.max(0.2, Math.min(12, source.durationSeconds - sourceStartSeconds))
  const safeDuration = Math.min(durationSeconds, maxDuration)
  const maxSourceStart = Math.max(0, source.durationSeconds - safeDuration)
  const update = (patch: Partial<Pick<EditingVideoBlock, 'position' | 'sourceStartSeconds' | 'durationSeconds' | 'sizePercent' | 'borderRadius' | 'borderWidth' | 'enterMotion' | 'exitMotion' | 'motionDurationSeconds'>>): void => onUpdate(block.id, patch)
  return <details className="editing-video-block-editor" open data-testid="editing-video-block-editor" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-video-block-summary"><span>{title}</span></summary>
    <div className="editing-video-block-editor-popover">
      <label className="editing-video-block-field"><span>{positionLabel}</span><AppSelect value={position} onChange={(event) => { const next = event.currentTarget.value as EditingVideoBlockPosition; setPosition(next); update({ position: next }) }} data-testid="editing-video-block-edit-position">{(Object.keys(positionLabels) as EditingVideoBlockPosition[]).map((key) => <option key={key} value={key}>{positionLabels[key]}</option>)}</AppSelect></label>
      <label className="editing-video-block-range"><span>{sourceStartLabel}</span><input type="range" min="0" max={Math.max(0, maxSourceStart)} step="0.1" value={Math.min(sourceStartSeconds, maxSourceStart)} onChange={(event) => { const next = Number(event.currentTarget.value); setSourceStartSeconds(next); update({ sourceStartSeconds: next }) }} data-testid="editing-video-block-edit-source-start" /><output>{sourceStartSeconds.toFixed(1)}s</output></label>
      <label className="editing-video-block-range"><span>{durationLabel}</span><input type="range" min="0.2" max={maxDuration} step="0.1" value={safeDuration} onChange={(event) => { const next = Number(event.currentTarget.value); setDurationSeconds(next); update({ durationSeconds: next }) }} data-testid="editing-video-block-edit-duration" /><output>{safeDuration.toFixed(1)}s</output></label>
      <label className="editing-video-block-range"><span>{sizeLabel}</span><input type="range" min={EDITING_VIDEO_BLOCK_MIN_SIZE_PERCENT} max={EDITING_VIDEO_BLOCK_MAX_SIZE_PERCENT} step="1" value={sizePercent} onChange={(event) => { const next = Number(event.currentTarget.value); setSizePercent(next); update({ sizePercent: next }) }} data-testid="editing-video-block-edit-size" /><output>{Math.round(sizePercent)}%</output></label>
      <label className="editing-video-block-range"><span>{radiusLabel}</span><input type="range" min={EDITING_VIDEO_BLOCK_MIN_BORDER_RADIUS} max={EDITING_VIDEO_BLOCK_MAX_BORDER_RADIUS} step="1" value={borderRadius} onChange={(event) => { const next = Number(event.currentTarget.value); setBorderRadius(next); update({ borderRadius: next }) }} data-testid="editing-video-block-edit-radius" /><output>{Math.round(borderRadius)}px</output></label>
      <label className="editing-video-block-range"><span>{borderLabel}</span><input type="range" min={EDITING_VIDEO_BLOCK_MIN_BORDER_WIDTH} max={EDITING_VIDEO_BLOCK_MAX_BORDER_WIDTH} step="1" value={borderWidth} onChange={(event) => { const next = Number(event.currentTarget.value); setBorderWidth(next); update({ borderWidth: next }) }} data-testid="editing-video-block-edit-border" /><output>{Math.round(borderWidth)}px</output></label>
      <label className="editing-video-block-field"><span>{enterLabel}</span><AppSelect value={enterMotion} onChange={(event) => { const next = event.currentTarget.value as EditingVideoBlockMotion; setEnterMotion(next); update({ enterMotion: next }) }} data-testid="editing-video-block-edit-enter">{EDITING_VIDEO_BLOCK_MOTIONS.map((key) => <option key={key} value={key}>{motionLabels[key]}</option>)}</AppSelect></label>
      <label className="editing-video-block-field"><span>{exitLabel}</span><AppSelect value={exitMotion} onChange={(event) => { const next = event.currentTarget.value as EditingVideoBlockMotion; setExitMotion(next); update({ exitMotion: next }) }} data-testid="editing-video-block-edit-exit">{EDITING_VIDEO_BLOCK_MOTIONS.map((key) => <option key={key} value={key}>{motionLabels[key]}</option>)}</AppSelect></label>
      <label className="editing-video-block-range"><span>{motionDurationLabel}</span><input type="range" min={EDITING_VIDEO_BLOCK_MOTION_MIN_DURATION} max={EDITING_VIDEO_BLOCK_MOTION_MAX_DURATION} step="0.05" value={motionDurationSeconds} onChange={(event) => { const next = Number(event.currentTarget.value); setMotionDurationSeconds(next); update({ motionDurationSeconds: next }) }} data-testid="editing-video-block-edit-motion-duration" /><output>{motionDurationSeconds.toFixed(2)}s</output></label>
    </div>
  </details>
}
