import { Captions, RotateCcw } from 'lucide-react'
import type { EditingCaptionLayout, EditingCaptionLineLayout } from '../../../shared/editing-types'
import { DEFAULT_EDITING_CAPTION_LAYOUT, EDITING_CAPTION_LAYOUT_LIMITS } from '../../../core/editing/caption-layout'

type Props = {
  title: string
  xLabel: string
  yLabel: string
  widthLabel: string
  sizeLabel: string
  resetLabel: string
  value: EditingCaptionLayout
  onChange: (patch: Partial<EditingCaptionLayout>) => void
}

type Slider = { key: keyof EditingCaptionLineLayout; label: string; min: number; max: number; step: number; suffix: string }

export function EditingCaptionLayoutControl({ title, xLabel, yLabel, widthLabel, sizeLabel, resetLabel, value, onChange }: Props): React.ReactElement {
  const sliders: Slider[] = [
    { key: 'xPercent', label: xLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.xPercent, step: 1, suffix: '%' },
    { key: 'yPercent', label: yLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.yPercent, step: 1, suffix: '%' },
    { key: 'widthPercent', label: widthLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.widthPercent, step: 1, suffix: '%' },
    { key: 'fontSizePx', label: sizeLabel, ...EDITING_CAPTION_LAYOUT_LIMITS.fontSizePx, step: 2, suffix: 'px' }
  ]
  return <details className="editing-caption-layout-control" data-testid="editing-caption-layout-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-caption-layout-summary"><Captions size={14} aria-hidden="true" /><span>{title}</span></summary>
    <div className="editing-caption-layout-popover">
      {sliders.map((slider) => <label className="editing-caption-layout-slider" key={slider.key}><span>{slider.label}</span><output>{Math.round(value[slider.key])}{slider.suffix}</output><input data-testid={`editing-caption-layout-${slider.key}`} type="range" min={slider.min} max={slider.max} step={slider.step} value={value[slider.key]} onChange={(event) => onChange({ [slider.key]: Number(event.target.value) })} /></label>)}
      <button className="editing-caption-layout-reset" type="button" onClick={() => onChange(DEFAULT_EDITING_CAPTION_LAYOUT)}><RotateCcw size={12} />{resetLabel}</button>
    </div>
  </details>
}
