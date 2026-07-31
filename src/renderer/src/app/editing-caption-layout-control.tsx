import { useState } from 'react'
import { Captions, RotateCcw } from 'lucide-react'
import type { EditingCaptionLayout, EditingCaptionLineLayout } from '../../../shared/editing-types'
import { DEFAULT_EDITING_CAPTION_LAYOUT, DEFAULT_EDITING_TRANSLATION_CAPTION_LAYOUT, EDITING_CAPTION_LAYOUT_LIMITS, getEditingCaptionLineLayout, type EditingCaptionLine, updateEditingCaptionLineLayout } from '../../../core/editing/caption-layout'

type Props = {
  title: string
  xLabel: string
  yLabel: string
  widthLabel: string
  sizeLabel: string
  resetLabel: string
  sourceLabel: string
  translationLabel: string
  hasTranslation: boolean
  value: EditingCaptionLayout
  onChange: (line: EditingCaptionLine, patch: Partial<EditingCaptionLineLayout>) => void
}

type Slider = { key: keyof EditingCaptionLineLayout; label: string; min: number; max: number; step: number; suffix: string }

export function EditingCaptionLayoutControl({ title, xLabel, yLabel, widthLabel, sizeLabel, resetLabel, sourceLabel, translationLabel, hasTranslation, value, onChange }: Props): React.ReactElement {
  const [line, setLine] = useState<EditingCaptionLine>('source')
  const lineValue = getEditingCaptionLineLayout(value, line)
  const sliders: Slider[] = [
    { key: 'xPercent', label: xLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.xPercent, step: 1, suffix: '%' },
    { key: 'yPercent', label: yLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.yPercent, step: 1, suffix: '%' },
    { key: 'widthPercent', label: widthLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.widthPercent, step: 1, suffix: '%' },
    { key: 'fontSizePx', label: sizeLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.fontSizePx, step: 2, suffix: 'px' }
  ]
  return <details className="editing-caption-layout-control" data-testid="editing-caption-layout-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-caption-layout-summary"><Captions size={14} aria-hidden="true" /><span>{title}</span></summary>
    <div className="editing-caption-layout-popover">
      <div className="editing-caption-layout-lines" role="tablist" aria-label={title}>
        <button className={`editing-caption-layout-line ${line === 'source' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={line === 'source'} onClick={() => setLine('source')}>{sourceLabel}</button>
        {hasTranslation ? <button className={`editing-caption-layout-line ${line === 'translation' ? 'is-active' : ''}`} type="button" role="tab" aria-selected={line === 'translation'} onClick={() => setLine('translation')}>{translationLabel}</button> : null}
      </div>
      {sliders.map((slider) => <label className="editing-caption-layout-slider" key={slider.key}><span>{slider.label}</span><output>{Math.round(lineValue[slider.key])}{slider.suffix}</output><input data-testid={`editing-caption-layout-${line}-${slider.key}`} type="range" min={slider.min} max={slider.max} step={slider.step} value={lineValue[slider.key]} onChange={(event) => onChange(line, { [slider.key]: Number(event.target.value) })} /></label>)}
      <button className="editing-caption-layout-reset" type="button" onClick={() => onChange(line, line === 'source' ? DEFAULT_EDITING_CAPTION_LAYOUT : updateEditingCaptionLineLayout(value, 'translation', DEFAULT_EDITING_TRANSLATION_CAPTION_LAYOUT).translation ?? DEFAULT_EDITING_TRANSLATION_CAPTION_LAYOUT)}><RotateCcw size={12} />{resetLabel}</button>
    </div>
  </details>
}
