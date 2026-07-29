import { PictureInPicture2 } from 'lucide-react'
import type { EditingSource, EditingVideoBlockPosition } from '../../../shared/editing-types'

type EditingVideoBlockControlProps = {
  sources: readonly EditingSource[]
  title: string
  addLabel: string
  sourceLabel: string
  positionLabel: string
  positionLabels: Record<EditingVideoBlockPosition, string>
  onAdd: (sourceId: string, options: { position: EditingVideoBlockPosition }) => void
}

export function EditingVideoBlockControl({ sources, title, addLabel, sourceLabel, positionLabel, positionLabels, onAdd }: EditingVideoBlockControlProps): React.ReactElement {
  const firstSourceId = sources[0]?.id ?? ''
  return <details className="editing-video-block-control" data-testid="editing-video-block-control">
    <summary className="editing-video-block-summary"><PictureInPicture2 size={15} />{title}</summary>
    <div className="editing-video-block-popover">
      <label className="editing-video-block-field"><span>{sourceLabel}</span><select defaultValue={firstSourceId} data-testid="editing-video-block-source">{sources.map((source) => <option key={source.id} value={source.id}>{source.name}</option>)}</select></label>
      <label className="editing-video-block-field"><span>{positionLabel}</span><select defaultValue="bottom-right" data-testid="editing-video-block-position">{(Object.keys(positionLabels) as EditingVideoBlockPosition[]).map((position) => <option key={position} value={position}>{positionLabels[position]}</option>)}</select></label>
      <button className="editing-video-block-add" type="button" disabled={sources.length === 0} data-testid="editing-video-block-add" onClick={(event) => { const popover = event.currentTarget.closest('.editing-video-block-popover'); const sourceId = popover?.querySelector<HTMLSelectElement>('[data-testid="editing-video-block-source"]')?.value ?? firstSourceId; const position = (popover?.querySelector<HTMLSelectElement>('[data-testid="editing-video-block-position"]')?.value ?? 'bottom-right') as EditingVideoBlockPosition; onAdd(sourceId, { position }); const details = event.currentTarget.closest('details'); if (details) details.open = false }}>{addLabel}</button>
    </div>
  </details>
}
