import { AppSelect } from '../../../shared/app-select'
import { Crop, Download, Film, FlipHorizontal, FlipVertical, Grid3X3, Lock, RotateCcw, RotateCw, SlidersHorizontal, Trash2, Unlock, Volume2, VolumeX } from 'lucide-react'
import { useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { LivePhotoEditOptions } from '../../../shared/live-photo-types'
import { formatImageBytes, getReductionPercent } from './image-editor-formatters'
import type { ImageAsset, ImageSettings, RenderedImage } from './image-editor-types'

type Copy = LocaleCopy['imageWorkspace']
type Props = {
  copy: Copy
  image: ImageAsset
  settings: ImageSettings
  preview: RenderedImage | null
  isRendering: boolean
  onUpdate: (patch: Partial<ImageSettings>) => void
  onReset: () => void
  onExport: () => void
  onExportLivePhoto: () => void
  onRemove: () => void
}

export function ImageTransformToolbar({ copy, settings, onUpdate, onReset }: Pick<Props, 'copy' | 'settings' | 'onUpdate' | 'onReset'>): React.ReactElement {
  const rotate = (delta: 90 | -90): void => onUpdate({ rotation: ((settings.rotation + delta + 360) % 360) as ImageSettings['rotation'] })
  return <div className="image-transform-toolbar" aria-label={copy.quickAdjust}>
    <span className="image-toolbar-label"><SlidersHorizontal size={14} />{copy.quickAdjust}</span>
    <button className="image-ghost-button" type="button" onClick={() => rotate(-90)} title={copy.rotateLeft} aria-label={copy.rotateLeft}><RotateCcw size={15} /></button>
    <button className="image-ghost-button" type="button" onClick={() => rotate(90)} title={copy.rotateRight} aria-label={copy.rotateRight}><RotateCw size={15} /></button>
    <button className={`image-ghost-button ${settings.flipX ? 'active' : ''}`} type="button" onClick={() => onUpdate({ flipX: !settings.flipX })} title={copy.flipHorizontal} aria-label={copy.flipHorizontal}><FlipHorizontal size={15} /></button>
    <button className={`image-ghost-button ${settings.flipY ? 'active' : ''}`} type="button" onClick={() => onUpdate({ flipY: !settings.flipY })} title={copy.flipVertical} aria-label={copy.flipVertical}><FlipVertical size={15} /></button>
    <button className="image-text-button" type="button" onClick={onReset}>{copy.reset}</button>
  </div>
}

function LivePhotoControls({ copy, image, settings, isRendering, onUpdate, onExportLivePhoto }: Pick<Props, 'copy' | 'image' | 'settings' | 'isRendering' | 'onUpdate' | 'onExportLivePhoto'>): React.ReactElement | null {
  const livePhoto = settings.livePhoto
  if (!livePhoto || !image.livePhoto) return null
  const sourceDuration = image.livePhoto.durationSeconds
  const updateLivePhoto = (patch: Partial<LivePhotoEditOptions>): void => onUpdate({ livePhoto: { ...livePhoto, ...patch } })
  const clampCoverTimestamp = (durationSeconds: number): number | null => livePhoto.coverTimestampSeconds === null || livePhoto.coverTimestampSeconds === undefined ? null : Math.min(durationSeconds, Math.max(0, livePhoto.coverTimestampSeconds))
  const setLiveNumber = (key: 'startSeconds' | 'durationSeconds', raw: string): void => {
    const value = Math.max(0.1, Number(raw) || 0.1)
    if (key === 'startSeconds') {
      const startSeconds = Math.min(value, Math.max(0, sourceDuration - 0.1))
      const durationSeconds = Math.min(livePhoto.durationSeconds, Math.max(0.1, sourceDuration - startSeconds))
      updateLivePhoto({ startSeconds, durationSeconds, coverTimestampSeconds: clampCoverTimestamp(durationSeconds) })
    } else {
      const durationSeconds = Math.min(value, Math.max(0.1, sourceDuration - livePhoto.startSeconds))
      updateLivePhoto({ durationSeconds, coverTimestampSeconds: clampCoverTimestamp(durationSeconds) })
    }
  }
  const coverFrameEnabled = livePhoto.coverTimestampSeconds !== null && livePhoto.coverTimestampSeconds !== undefined
  return <div className="image-control-section live-photo-control-section">
    <h3><Film size={14} />{copy.livePhotoEdit}</h3>
    <div className="image-dimension-grid">
      <label>{copy.livePhotoStart}<input className="image-number-input" type="number" min="0" max={sourceDuration} step="0.1" value={Number(livePhoto.startSeconds.toFixed(1))} onChange={(event) => setLiveNumber('startSeconds', event.target.value)} /></label>
      <label>{copy.livePhotoDuration}<input className="image-number-input" type="number" min="0.1" max={sourceDuration} step="0.1" value={Number(livePhoto.durationSeconds.toFixed(1))} onChange={(event) => setLiveNumber('durationSeconds', event.target.value)} /></label>
    </div>
    <label className="image-quality-row"><span className="image-inline-label"><Crop size={14} />{copy.livePhotoCrop}</span><output>{Math.round(livePhoto.cropScale * 100)}%</output></label>
    <input className="image-range" type="range" min="0.1" max="1" step="0.05" value={livePhoto.cropScale} onChange={(event) => updateLivePhoto({ cropScale: Number(event.target.value) })} />
    <label className="image-check-row"><input type="checkbox" checked={livePhoto.mute} onChange={(event) => updateLivePhoto({ mute: event.target.checked })} />{livePhoto.mute ? <VolumeX size={14} /> : <Volume2 size={14} />}<span><strong>{copy.livePhotoMute}</strong><small>{copy.livePhotoMuteHint}</small></span></label>
    <label className="image-check-row"><input type="checkbox" checked={livePhoto.mosaic.enabled} onChange={(event) => updateLivePhoto({ mosaic: { ...livePhoto.mosaic, enabled: event.target.checked } })} /><Grid3X3 size={14} /><span><strong>{copy.livePhotoMosaic}</strong><small>{copy.livePhotoMosaicHint}</small></span></label>
    {livePhoto.mosaic.enabled ? <>
      <label className="image-quality-row"><span>{copy.livePhotoMosaicSize}</span><output>{Math.round(livePhoto.mosaic.width * 100)}%</output></label>
      <input className="image-range" type="range" min="0.15" max="0.65" step="0.05" value={livePhoto.mosaic.width} onChange={(event) => { const width = Number(event.target.value); updateLivePhoto({ mosaic: { ...livePhoto.mosaic, x: (1 - width) / 2, width } }) }} />
    </> : null}
    <label className="image-check-row"><input type="checkbox" checked={coverFrameEnabled} onChange={(event) => updateLivePhoto({ coverTimestampSeconds: event.target.checked ? Math.min(livePhoto.durationSeconds / 2, Math.max(0, livePhoto.durationSeconds - 0.1)) : null })} /><span><strong>{copy.livePhotoCoverFrame}</strong><small>{copy.livePhotoCoverFrameHint}</small></span></label>
    {coverFrameEnabled ? <label>{copy.livePhotoCoverTime}<input className="image-number-input" type="number" min="0" max={livePhoto.durationSeconds} step="0.1" value={Number(livePhoto.coverTimestampSeconds!.toFixed(1))} onChange={(event) => updateLivePhoto({ coverTimestampSeconds: Math.min(livePhoto.durationSeconds, Math.max(0, Number(event.target.value) || 0)) })} /></label> : null}
    <button className="image-export-button live-photo-export-button" type="button" onClick={onExportLivePhoto} disabled={isRendering}><Download size={16} />{copy.livePhotoExport}</button>
  </div>
}

export function ImageEditorControls({ copy, image, settings, preview, isRendering, onUpdate, onReset, onExport, onExportLivePhoto, onRemove }: Props): React.ReactElement {
  const [targetUnit, setTargetUnit] = useState<'KB' | 'MB'>(settings.targetSizeBytes >= 1024 * 1024 ? 'MB' : 'KB')
  const ratio = image.height / image.width
  const setDimension = (key: 'width' | 'height', raw: string): void => {
    const value = Math.max(1, Math.round(Number(raw) || 1))
    if (!settings.lockAspectRatio) { onUpdate({ [key]: value }); return }
    if (key === 'width') onUpdate({ width: value, height: Math.max(1, Math.round(value * ratio)) })
    else onUpdate({ height: value, width: Math.max(1, Math.round(value / ratio)) })
  }
  const setTargetSize = (raw: string): void => onUpdate({ targetSizeBytes: Math.max(1024, Math.round((Number(raw) || 1) * (targetUnit === 'MB' ? 1024 * 1024 : 1024))) })
  const targetValue = settings.targetSizeBytes / (targetUnit === 'MB' ? 1024 * 1024 : 1024)
  const reduction = preview ? getReductionPercent(image.sizeBytes, preview.blob.size) : 0
  return <aside className="image-inspector">
    <div className="image-inspector-heading"><div><span className="image-section-kicker">{copy.subtitle}</span><h2>{copy.editor}</h2></div><button className="image-ghost-button danger" type="button" onClick={onRemove} title={copy.remove} aria-label={copy.remove}><Trash2 size={15} /></button></div>
    <div className="image-control-section"><h3>{copy.quickAdjust}</h3><div className="image-preset-row"><button type="button" onClick={() => onUpdate({ width: image.width, height: image.height })}>{copy.originalSize}</button><button type="button" onClick={() => onUpdate({ width: Math.max(1, Math.round(image.width * 0.5)), height: Math.max(1, Math.round(image.height * 0.5)) })}>{copy.halfSize}</button><button type="button" onClick={() => { const factor = Math.min(1, 1920 / image.width); onUpdate({ width: Math.max(1, Math.round(image.width * factor)), height: Math.max(1, Math.round(image.height * factor)) }) }}>{copy.webSize}</button></div></div>
    <LivePhotoControls copy={copy} image={image} settings={settings} isRendering={isRendering} onUpdate={onUpdate} onExportLivePhoto={onExportLivePhoto} />
    <div className="image-control-section"><h3>{copy.outputSize}</h3><div className="image-dimension-grid"><label>{copy.width}<input className="image-number-input" type="number" min="1" value={settings.width} onChange={(event) => setDimension('width', event.target.value)} /></label><label>{copy.height}<input className="image-number-input" type="number" min="1" value={settings.height} onChange={(event) => setDimension('height', event.target.value)} /></label></div><button className={`image-lock-toggle ${settings.lockAspectRatio ? 'active' : ''}`} type="button" onClick={() => onUpdate({ lockAspectRatio: !settings.lockAspectRatio })}>{settings.lockAspectRatio ? <Lock size={14} /> : <Unlock size={14} />}{copy.keepRatio}</button></div>
    <div className="image-control-section"><label className="image-field-label" htmlFor="image-format">{copy.format}</label><AppSelect id="image-format" className="image-select" value={settings.format} onChange={(event) => onUpdate({ format: event.target.value as ImageSettings['format'] })}><option value="original">{copy.formatOriginal}</option><option value="jpeg">{copy.formatJpeg}</option><option value="webp">{copy.formatWebp}</option><option value="png">{copy.formatPng}</option></AppSelect><div className="image-quality-row"><label htmlFor="image-quality">{copy.quality}</label><output>{Math.round(settings.quality * 100)}%</output></div><input id="image-quality" className="image-range" type="range" min="0.1" max="1" step="0.01" value={settings.quality} disabled={settings.useTargetSize} onChange={(event) => onUpdate({ quality: Number(event.target.value) })} /></div>
    <div className={`image-control-section image-target-section ${settings.useTargetSize ? 'active' : ''}`}><label className="image-check-row"><input type="checkbox" checked={settings.useTargetSize} onChange={(event) => onUpdate({ useTargetSize: event.target.checked })} /><span><strong>{copy.targetSize}</strong><small>{copy.targetSizeHint}</small></span></label>{settings.useTargetSize ? <div className="image-target-input"><input className="image-number-input" type="number" min="1" step="0.1" aria-label={copy.targetSizePlaceholder} value={Number(targetValue.toFixed(2))} onChange={(event) => setTargetSize(event.target.value)} /><AppSelect className="image-unit-select" value={targetUnit} onChange={(event) => { const nextUnit = event.target.value as 'KB' | 'MB'; setTargetUnit(nextUnit); onUpdate({ targetSizeBytes: Math.max(1024, Math.round(targetValue * (nextUnit === 'MB' ? 1024 * 1024 : 1024))) }) }}><option value="KB">{copy.kb}</option><option value="MB">{copy.mb}</option></AppSelect></div> : null}{settings.useTargetSize && settings.format === 'png' ? <small className="image-control-hint">{copy.targetPngHint}</small> : null}</div>
    <div className="image-output-summary"><div><span>{copy.outputFileSize}</span><strong>{preview ? formatImageBytes(preview.blob.size) : '—'}</strong></div><div><span>{copy.reduction(reduction)}</span><strong>{preview ? `${preview.width} × ${preview.height}` : '—'}</strong></div></div><button className="image-export-button" type="button" onClick={onExport} disabled={isRendering || !preview}><Download size={16} />{isRendering ? copy.rendering : copy.export}</button>
  </aside>
}
