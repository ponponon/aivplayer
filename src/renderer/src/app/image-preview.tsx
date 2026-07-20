import { Image as ImageIcon } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatImageBytes } from './image-editor-formatters'
import { ImageTransformToolbar } from './image-editor-controls'
import type { ImageAsset, ImageSettings, RenderedImage } from './image-editor-types'

type Props = { copy: LocaleCopy['imageWorkspace']; image: ImageAsset | null; settings: ImageSettings | null; previewUrl: string | null; preview: RenderedImage | null; isRendering: boolean; onUpdate: (patch: Partial<ImageSettings>) => void; onReset: () => void; onOpen: () => void }

export function ImagePreview({ copy, image, settings, previewUrl, preview, isRendering, onUpdate, onReset, onOpen }: Props): React.ReactElement {
  if (!image || !settings) return <section className="image-preview-stage image-preview-empty"><ImageIcon size={42} /><h2>{copy.dropTitle}</h2><p>{copy.dropDescription}</p><button className="image-primary-button" type="button" onClick={onOpen}>{copy.open}</button></section>
  return <section className="image-preview-stage"><div className="image-preview-header"><div><span className="image-section-kicker">{copy.preview}</span><h2>{image.name}</h2></div><div className="image-preview-meta"><span>{image.width} × {image.height}</span><span>{formatImageBytes(image.sizeBytes)}</span></div></div><div className="image-preview-canvas media-preview-frame">{previewUrl ? <img className={`image-preview-media media-preview-content ${isRendering ? 'rendering' : ''}`} src={previewUrl} alt={image.name} /> : <ImageIcon size={36} />}</div><div className="image-preview-footer"><span>{copy.original}: {image.width} × {image.height}</span><span>{copy.output}: {preview ? `${preview.width} × ${preview.height} · ${formatImageBytes(preview.blob.size)}` : '—'}</span></div><ImageTransformToolbar copy={copy} settings={settings} onUpdate={onUpdate} onReset={onReset} /></section>
}
