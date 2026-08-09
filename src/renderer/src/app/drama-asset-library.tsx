import { Check, Edit3, Plus, Search, Trash2, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import type { DramaAsset, DramaAssetInput, DramaAssetStatus, DramaAssetType } from '../../../shared/drama-types'
import type { LocaleCopy } from '../../../shared/i18n'

type DramaAssetFilter = 'all' | DramaAssetType

type DramaAssetLibraryProps = {
  assets: readonly DramaAsset[]
  copy: LocaleCopy['drama']
  busy: boolean
  onSave: (assetId: string | null, input: DramaAssetInput, status?: DramaAssetStatus) => void
  onDelete: (asset: DramaAsset) => void
}

type AssetDraft = DramaAssetInput & { status: DramaAssetStatus }

const EMPTY_DRAFT: AssetDraft = {
  assetType: 'character',
  name: '',
  description: '',
  visualPrompt: '',
  status: 'draft'
}

export function DramaAssetLibrary({ assets, copy, busy, onSave, onDelete }: DramaAssetLibraryProps): React.ReactElement {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<DramaAssetFilter>('all')
  const [editingAssetId, setEditingAssetId] = useState<string | null | undefined>(undefined)
  const [draft, setDraft] = useState<AssetDraft>(EMPTY_DRAFT)
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleAssets = useMemo(() => assets.filter((asset) => {
    if (filter !== 'all' && asset.assetType !== filter) return false
    if (!normalizedQuery) return true
    return `${asset.name} ${asset.description} ${asset.visualPrompt}`.toLocaleLowerCase().includes(normalizedQuery)
  }), [assets, filter, normalizedQuery])

  const startCreate = (): void => {
    setEditingAssetId(null)
    setDraft({ ...EMPTY_DRAFT })
  }

  const startEdit = (asset: DramaAsset): void => {
    setEditingAssetId(asset.id)
    setDraft({ assetType: asset.assetType, name: asset.name, description: asset.description, visualPrompt: asset.visualPrompt, status: asset.status })
  }

  const cancelEdit = (): void => {
    setEditingAssetId(undefined)
    setDraft({ ...EMPTY_DRAFT })
  }

  const saveDraft = (): void => {
    if (!draft.name.trim() || busy) return
    onSave(editingAssetId ?? null, { assetType: draft.assetType, name: draft.name, description: draft.description, visualPrompt: draft.visualPrompt }, draft.status)
    cancelEdit()
  }

  const toggleStatus = (asset: DramaAsset): void => {
    if (busy) return
    onSave(asset.id, asset, asset.status === 'ready' ? 'draft' : 'ready')
  }

  const typeLabel = (assetType: DramaAssetType): string => {
    if (assetType === 'character') return copy.assetFilterCharacter
    if (assetType === 'location') return copy.assetFilterLocation
    return copy.assetFilterProp
  }

  return <section className="drama-asset-library" data-testid="drama-asset-library" aria-label={copy.assetLibraryTitle}>
    <div className="drama-asset-library-heading">
      <div><strong>{copy.assetLibraryTitle}</strong><small>{copy.assets(assets.length)}</small></div>
      <button className="drama-secondary-action" type="button" onClick={startCreate} disabled={busy}><Plus size={13} />{copy.assetAdd}</button>
    </div>
    <p className="drama-asset-library-description">{copy.assetLibraryDescription}</p>
    <label className="drama-asset-search"><Search size={13} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.currentTarget.value)} placeholder={copy.assetSearchPlaceholder} aria-label={copy.assetSearchPlaceholder} data-testid="drama-asset-search" /></label>
    <div className="drama-asset-filters" role="tablist" aria-label={copy.assetLibraryTitle}>
      {(['all', 'character', 'location', 'prop'] as const).map((value) => <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'is-active' : ''} onClick={() => setFilter(value)}>{value === 'all' ? copy.assetFilterAll : typeLabel(value)}</button>)}
    </div>
    {editingAssetId !== undefined ? <div className="drama-asset-editor" data-testid="drama-asset-editor">
      <div className="drama-asset-editor-heading"><strong>{editingAssetId ? copy.assetEdit : copy.assetAdd}</strong><button className="drama-icon-button" type="button" onClick={cancelEdit} title={copy.assetCancel} aria-label={copy.assetCancel}><X size={13} /></button></div>
      <div className="drama-asset-editor-fields">
        <label><span>{copy.assetName}</span><input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.currentTarget.value }))} autoFocus /></label>
        <label><span>{copy.assetFilterAll}</span><select value={draft.assetType} onChange={(event) => setDraft((current) => ({ ...current, assetType: event.currentTarget.value as DramaAssetType }))}><option value="character">{copy.assetFilterCharacter}</option><option value="location">{copy.assetFilterLocation}</option><option value="prop">{copy.assetFilterProp}</option></select></label>
        <label><span>{copy.assetDescription}</span><textarea value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.currentTarget.value }))} rows={2} /></label>
        <label><span>{copy.assetVisualPrompt}</span><textarea value={draft.visualPrompt} onChange={(event) => setDraft((current) => ({ ...current, visualPrompt: event.currentTarget.value }))} rows={3} /></label>
      </div>
      <div className="drama-actions"><button className="drama-secondary-action" type="button" onClick={cancelEdit} disabled={busy}>{copy.assetCancel}</button><button className="drama-primary-action" type="button" onClick={saveDraft} disabled={busy || !draft.name.trim()}><Check size={13} />{copy.assetSave}</button></div>
    </div> : null}
    {visibleAssets.length > 0 ? <div className="drama-asset-list" data-testid="drama-asset-list">{visibleAssets.map((asset) => <article className="drama-asset-card" key={asset.id} data-testid={`drama-asset-${asset.id}`}>
      <div className="drama-asset-card-heading"><div><span className="drama-asset-type">{typeLabel(asset.assetType)}</span><strong>{asset.name}</strong></div><span className={`drama-asset-status ${asset.status}`}>{asset.status === 'ready' ? copy.assetReady : copy.assetDraft}</span></div>
      {asset.description ? <p>{asset.description}</p> : null}
      {asset.visualPrompt ? <small className="drama-asset-prompt">{asset.visualPrompt}</small> : null}
      <div className="drama-asset-card-actions"><button className="drama-secondary-action" type="button" onClick={() => startEdit(asset)} disabled={busy}><Edit3 size={12} />{copy.assetEdit}</button><button className="drama-secondary-action" type="button" onClick={() => toggleStatus(asset)} disabled={busy}>{asset.status === 'ready' ? copy.assetMarkDraft : copy.assetMarkReady}</button><button className="drama-icon-button drama-asset-delete" type="button" onClick={() => onDelete(asset)} disabled={busy} title={copy.assetDelete} aria-label={`${copy.assetDelete}: ${asset.name}`}><Trash2 size={13} /></button></div>
    </article>)}</div> : <p className="drama-asset-empty">{assets.length > 0 ? copy.assetNoMatch : copy.assetEmpty}</p>}
    <p className="drama-asset-library-hint">{copy.assetManualHint}</p>
  </section>
}
