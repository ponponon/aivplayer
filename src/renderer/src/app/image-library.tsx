import { FileImage, ImagePlus } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatImageBytes } from './image-editor-formatters'
import type { ImageAsset } from './image-editor-types'

type Props = { copy: LocaleCopy['imageWorkspace']; images: ImageAsset[]; selectedId: string | null; onSelect: (id: string) => void; onOpen: () => void }

export function ImageLibrary({ copy, images, selectedId, onSelect, onOpen }: Props): React.ReactElement {
  return <aside className="image-library"><div className="image-library-heading"><div><span className="image-section-kicker">{copy.title}</span><h2>{copy.fileCount(images.length)}</h2></div><button className="image-ghost-button" type="button" onClick={onOpen} title={copy.import} aria-label={copy.import}><ImagePlus size={16} /></button></div>{images.length === 0 ? <button className="image-library-empty" type="button" onClick={onOpen}><FileImage size={25} /><strong>{copy.noImages}</strong><span>{copy.import}</span></button> : <div className="image-library-list">{images.map((image) => <button key={image.id} className={`image-library-item ${selectedId === image.id ? 'active' : ''}`} type="button" onClick={() => onSelect(image.id)} aria-current={selectedId === image.id ? 'true' : undefined}><img src={image.sourceUrl} alt="" /><span className="image-library-copy"><strong title={image.name}>{image.name}</strong><small>{image.width} × {image.height}</small><small>{formatImageBytes(image.sizeBytes)}</small></span></button>)}</div>}</aside>
}
