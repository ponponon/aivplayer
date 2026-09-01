import { AppSelect } from '../../../shared/app-select'
import { useEffect, useRef, useState } from 'react'
import type { EditingElementAsset } from '../../../core/editing/element-assets'
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
  presetLabel: string
  presetLabels: Record<EditingGraphicPresetId, string>
  presetTexts: Record<EditingGraphicPresetId, string>
  assetLibraryLabel: string
  assetSearchPlaceholder: string
  assetEmptyLabel: string
  assetDeleteLabel: string
  assets: readonly EditingElementAsset[]
  onDeleteAsset: (assetId: string) => void
  defaultPosition: EditingGraphicPosition
  defaultStyle: EditingGraphicStyle
  positionLabels: Record<EditingGraphicPosition, string>
  currentTime: number
  timelineDuration: number
  onAdd: (text: string, options: { position: EditingGraphicPosition; style: EditingGraphicStyle; durationSeconds: number }) => void
}

type EditingGraphicPresetId = 'title' | 'label' | 'quote'

const GRAPHIC_PRESETS: readonly { id: EditingGraphicPresetId; position: EditingGraphicPosition; style: EditingGraphicStyle }[] = [
  { id: 'title', position: 'center', style: 'title' },
  { id: 'label', position: 'bottom-left', style: 'label' },
  { id: 'quote', position: 'center', style: 'label' }
]

export function EditingGraphicControl({ title, textLabel, textPlaceholder, addLabel, positionLabel, styleLabel, titleStyleLabel, labelStyleLabel, durationLabel, presetLabel, presetLabels, presetTexts, assetLibraryLabel, assetSearchPlaceholder, assetEmptyLabel, assetDeleteLabel, assets, onDeleteAsset, defaultPosition, defaultStyle, positionLabels, currentTime, timelineDuration, onAdd }: EditingGraphicControlProps): React.ReactElement {
  const detailsRef = useRef<HTMLDetailsElement>(null)
  const [text, setText] = useState('')
  const [position, setPosition] = useState<EditingGraphicPosition>('center')
  const [style, setStyle] = useState<EditingGraphicStyle>('title')
  const [durationSeconds, setDurationSeconds] = useState(3)
  const [assetQuery, setAssetQuery] = useState('')
  useEffect(() => { setPosition(defaultPosition); setStyle(defaultStyle) }, [defaultPosition, defaultStyle])
  const maxDuration = Math.max(0.2, Math.min(8, timelineDuration - currentTime))
  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault()
    if (!text.trim()) return
    onAdd(text, { position, style, durationSeconds: Math.min(durationSeconds, maxDuration) })
    setText('')
    if (detailsRef.current) detailsRef.current.open = false
  }
  const addPreset = (preset: (typeof GRAPHIC_PRESETS)[number]): void => {
    if (timelineDuration - currentTime < 0.2) return
    onAdd(presetTexts[preset.id], { position: preset.position, style: preset.style, durationSeconds: Math.min(3, maxDuration) })
    if (detailsRef.current) detailsRef.current.open = false
  }
  const handleToggle = (event: React.SyntheticEvent<HTMLDetailsElement>): void => {
    if (!event.currentTarget.open) return
    document.querySelectorAll('.editing-graphic-editor[open] .editing-graphic-summary').forEach((element) => (element as HTMLElement).click())
  }
  const visibleAssets = assets.filter((asset) => !assetQuery.trim() || `${asset.name} ${asset.text}`.toLocaleLowerCase().includes(assetQuery.trim().toLocaleLowerCase()))
  const addSavedAsset = (asset: EditingElementAsset): void => {
    if (timelineDuration - currentTime < 0.2) return
    onAdd(asset.text, { position: asset.position, style: asset.style, durationSeconds: Math.min(asset.durationSeconds, maxDuration) })
    if (detailsRef.current) detailsRef.current.open = false
  }
  return <details ref={detailsRef} className="editing-graphic-control" onClick={(event) => event.stopPropagation()} onToggle={handleToggle} data-testid="editing-graphic-control">
    <summary className="editing-graphic-summary"><span>{title}</span></summary>
    <form className="editing-graphic-popover" onSubmit={submit}>
      <div className="editing-graphic-presets" aria-label={presetLabel}>
        <span className="editing-graphic-presets-label">{presetLabel}</span>
        <div className="editing-graphic-preset-list">
          {GRAPHIC_PRESETS.map((preset) => <button key={preset.id} className="editing-graphic-preset" type="button" onClick={() => addPreset(preset)} disabled={timelineDuration - currentTime < 0.2} data-testid={`editing-graphic-preset-${preset.id}`}>{presetLabels[preset.id]}</button>)}
        </div>
      </div>
      <div className="editing-graphic-assets" aria-label={assetLibraryLabel}>
        <div className="editing-graphic-assets-heading"><span>{assetLibraryLabel}</span><small>{assets.length}</small></div>
        {assets.length > 0 ? <input className="editing-graphic-assets-search" value={assetQuery} onChange={(event) => setAssetQuery(event.currentTarget.value)} placeholder={assetSearchPlaceholder} aria-label={assetSearchPlaceholder} data-testid="editing-graphic-assets-search" /> : null}
        <div className="editing-graphic-asset-list">
          {visibleAssets.map((asset) => <div className="editing-graphic-asset-item" key={asset.id}><button className="editing-graphic-asset" type="button" onClick={() => addSavedAsset(asset)} data-testid={`editing-graphic-asset-${asset.id}`}>{asset.name}</button><button className="editing-graphic-asset-delete" type="button" onClick={() => onDeleteAsset(asset.id)} title={assetDeleteLabel} aria-label={`${assetDeleteLabel}: ${asset.name}`}>×</button></div>)}
          {assets.length > 0 && visibleAssets.length === 0 ? <small className="editing-graphic-assets-empty">{assetEmptyLabel}</small> : null}
        </div>
      </div>
      <label className="editing-graphic-field"><span>{textLabel}</span><input value={text} onChange={(event) => setText(event.currentTarget.value)} placeholder={textPlaceholder} data-testid="editing-graphic-text" /></label>
      <label className="editing-graphic-field"><span>{positionLabel}</span><AppSelect value={position} onChange={(event) => setPosition(event.currentTarget.value as EditingGraphicPosition)}>{(Object.keys(positionLabels) as EditingGraphicPosition[]).map((key) => <option key={key} value={key}>{positionLabels[key]}</option>)}</AppSelect></label>
      <label className="editing-graphic-field"><span>{styleLabel}</span><AppSelect value={style} onChange={(event) => setStyle(event.currentTarget.value as EditingGraphicStyle)}><option value="title">{titleStyleLabel}</option><option value="label">{labelStyleLabel}</option></AppSelect></label>
      <label className="editing-graphic-duration"><span>{durationLabel}</span><input type="range" min="0.2" max={maxDuration} step="0.1" value={Math.min(durationSeconds, maxDuration)} onChange={(event) => setDurationSeconds(Number(event.currentTarget.value))} /><output>{Math.min(durationSeconds, maxDuration).toFixed(1)}s</output></label>
      <button className="editing-graphic-add" type="submit" disabled={!text.trim() || timelineDuration - currentTime < 0.2} data-testid="editing-graphic-add">{addLabel}</button>
    </form>
  </details>
}
