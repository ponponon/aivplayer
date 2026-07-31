import { LayoutGrid } from 'lucide-react'
import { useRef } from 'react'
import type { EditingCanvasPresetId } from '../../../shared/editing-types'
import { getEditingCanvasPreset } from '../../../core/editing/canvases'

type Props = {
  title: string
  names: Record<EditingCanvasPresetId, string>
  value: EditingCanvasPresetId
  onChange: (value: EditingCanvasPresetId) => void
}

export function EditingCanvasControl({ title, names, value, onChange }: Props): React.ReactElement {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  return <details ref={detailsRef} className="editing-canvas-control" data-testid="editing-canvas-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-canvas-summary"><LayoutGrid size={14} aria-hidden="true" /><span>{title}</span><small>{getEditingCanvasPreset(value).ratio}</small></summary>
    <div className="editing-canvas-popover">
      <strong>{title}</strong>
      <div className="editing-canvas-options" role="group" aria-label={title}>
        {(Object.keys(names) as EditingCanvasPresetId[]).map((presetId) => <button key={presetId} className={`editing-canvas-option is-${presetId} ${value === presetId ? 'is-active' : ''}`} type="button" onClick={() => { onChange(presetId); detailsRef.current!.open = false }} aria-pressed={value === presetId} data-testid={`editing-canvas-${presetId}`}><span className="editing-canvas-preview" aria-hidden="true" /><span>{names[presetId]}</span><small>{getEditingCanvasPreset(presetId).ratio}</small></button>)}
      </div>
    </div>
  </details>
}
