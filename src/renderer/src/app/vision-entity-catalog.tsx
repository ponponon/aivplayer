import { CheckSquare, Eye, EyeOff, GitMerge, Save, Settings2, Square } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { VisionEntityCatalog, VisionEntityCatalogBatchPatch, VisionEntityCatalogEntry, VisionEntityCatalogPatch } from '../../../shared/vision-entity-types'

type VisionEntityCatalogProps = {
  copy: LocaleCopy['vision']
  catalog: VisionEntityCatalog | null
  onUpdate: (patch: VisionEntityCatalogPatch) => Promise<void>
  onBatchUpdate: (patch: VisionEntityCatalogBatchPatch) => Promise<void>
}

type EntityDraft = {
  name: string
  aliases: string
}

export function VisionEntityCatalog({ copy, catalog, onUpdate, onBatchUpdate }: VisionEntityCatalogProps): ReactElement | null {
  const [drafts, setDrafts] = useState<Record<string, EntityDraft>>({})
  const [savingLabelId, setSavingLabelId] = useState<string | null>(null)
  const [selectedLabelIds, setSelectedLabelIds] = useState<Set<string>>(new Set())
  const [batchTarget, setBatchTarget] = useState('')
  const [batchSaving, setBatchSaving] = useState(false)

  useEffect(() => {
    if (!catalog) return
    setDrafts(Object.fromEntries(catalog.entries.map((entry) => [entry.labelId, { name: entry.name, aliases: entry.aliases.join(', ') }])))
    setSelectedLabelIds((current) => new Set([...current].filter((labelId) => catalog.entries.some((entry) => entry.labelId === labelId))))
  }, [catalog])

  if (!catalog) return null

  const updateEntry = async (entry: VisionEntityCatalogEntry, patch: VisionEntityCatalogPatch): Promise<void> => {
    setSavingLabelId(entry.labelId)
    try {
      await onUpdate(patch)
    } catch {
      // The parent keeps the visible error state; this prevents an unhandled promise from button actions.
    } finally {
      setSavingLabelId(null)
    }
  }

  const saveDraft = (entry: VisionEntityCatalogEntry): void => {
    const draft = drafts[entry.labelId]
    if (!draft) return
    void updateEntry(entry, {
      labelId: entry.labelId,
      name: draft.name,
      aliases: draft.aliases.split(',').map((alias) => alias.trim()).filter(Boolean)
    })
  }

  const toggleSelected = (labelId: string): void => {
    setSelectedLabelIds((current) => {
      const next = new Set(current)
      if (next.has(labelId)) next.delete(labelId)
      else next.add(labelId)
      return next
    })
  }

  const toggleAll = (): void => {
    setSelectedLabelIds((current) => current.size === catalog.entries.length ? new Set() : new Set(catalog.entries.map((entry) => entry.labelId)))
  }

  const runBatchUpdate = async (action: VisionEntityCatalogBatchPatch['action']): Promise<void> => {
    if (selectedLabelIds.size === 0 || batchSaving) return
    if (action === 'merge' && (!batchTarget || selectedLabelIds.has(batchTarget))) return
    setBatchSaving(true)
    try {
      await onBatchUpdate({ labelIds: [...selectedLabelIds], action, ...(action === 'merge' ? { mergedInto: batchTarget } : {}) })
      setSelectedLabelIds(new Set())
      setBatchTarget('')
    } catch {
      // The parent keeps the visible error state.
    } finally {
      setBatchSaving(false)
    }
  }

  return <section className="vision-entity-catalog">
    <div className="vision-entity-catalog-heading"><div><strong>{copy.entityCatalogTitle}</strong><small>{copy.entityCatalogDescription}</small></div><div className="vision-entity-catalog-heading-actions"><button className="vision-secondary-action" type="button" onClick={toggleAll} disabled={batchSaving}>{selectedLabelIds.size === catalog.entries.length ? <Square size={12} /> : <CheckSquare size={12} />}{selectedLabelIds.size === catalog.entries.length ? copy.entityCatalogClearSelection : copy.entityCatalogSelectAll}</button><Settings2 size={15} /></div></div>
    {selectedLabelIds.size > 0 ? <div className="vision-entity-catalog-batch"><span>{copy.entityCatalogSelected(selectedLabelIds.size)}</span><button className="vision-secondary-action" type="button" disabled={batchSaving} onClick={() => void runBatchUpdate('hide')}><EyeOff size={12} />{copy.entityCatalogBatchHide}</button><button className="vision-secondary-action" type="button" disabled={batchSaving} onClick={() => void runBatchUpdate('show')}><Eye size={12} />{copy.entityCatalogBatchShow}</button><select className="vision-entity-catalog-merge" value={batchTarget} disabled={batchSaving} aria-label={copy.entityCatalogBatchMergeTarget} onChange={(event) => setBatchTarget(event.target.value)}><option value="">{copy.entityCatalogBatchNoTarget}</option>{catalog.entries.filter((entry) => !selectedLabelIds.has(entry.labelId)).map((entry) => <option value={entry.labelId} key={entry.labelId}>{entry.name}</option>)}</select><button className="vision-secondary-action" type="button" disabled={batchSaving || !batchTarget} onClick={() => void runBatchUpdate('merge')}><GitMerge size={12} />{batchSaving ? copy.entityCatalogBatchSaving : copy.entityCatalogBatchMerge}</button></div> : null}
    <div className="vision-entity-catalog-list">
      {catalog.entries.map((entry) => {
        const draft = drafts[entry.labelId] ?? { name: entry.name, aliases: entry.aliases.join(', ') }
        const saving = savingLabelId === entry.labelId || batchSaving
        return <article className={`vision-entity-catalog-row ${entry.hidden ? 'is-hidden' : ''}`} key={entry.labelId}>
          <input className="vision-entity-catalog-select" type="checkbox" checked={selectedLabelIds.has(entry.labelId)} disabled={batchSaving} onChange={() => toggleSelected(entry.labelId)} aria-label={copy.entityCatalogSelectLabel(entry.name)} />
          <div className="vision-entity-catalog-meta"><strong>{entry.defaultName}</strong><small>{copy.entityCatalogModelLabel(entry.labelId)}</small></div>
          <input className="vision-entity-catalog-input" value={draft.name} onChange={(event) => setDrafts((current) => ({ ...current, [entry.labelId]: { ...draft, name: event.target.value } }))} placeholder={copy.entityCatalogNamePlaceholder} aria-label={copy.entityCatalogNamePlaceholder} />
          <input className="vision-entity-catalog-input" value={draft.aliases} onChange={(event) => setDrafts((current) => ({ ...current, [entry.labelId]: { ...draft, aliases: event.target.value } }))} placeholder={copy.entityCatalogAliasesPlaceholder} aria-label={copy.entityCatalogAliasesLabel} />
          <select className="vision-entity-catalog-merge" value={entry.mergedInto ?? ''} aria-label={copy.entityCatalogMergeLabel} onChange={(event) => void updateEntry(entry, { labelId: entry.labelId, mergedInto: event.target.value || null })}>
            <option value="">{copy.entityCatalogNoMerge}</option>
            {catalog.entries.filter((candidate) => candidate.labelId !== entry.labelId).map((candidate) => <option value={candidate.labelId} key={candidate.labelId}>{candidate.name}</option>)}
          </select>
          <div className="vision-entity-catalog-actions">
            <button className="vision-secondary-action" type="button" disabled={saving} onClick={() => saveDraft(entry)} title={copy.entityCatalogSave}><Save size={13} />{saving ? copy.entityCatalogSaving : copy.entityCatalogSave}</button>
            <button className="vision-secondary-action" type="button" disabled={saving} onClick={() => void updateEntry(entry, { labelId: entry.labelId, hidden: !entry.hidden })} title={entry.hidden ? copy.entityCatalogShow : copy.entityCatalogHide}>{entry.hidden ? <Eye size={13} /> : <EyeOff size={13} />}{entry.hidden ? copy.entityCatalogShow : copy.entityCatalogHide}</button>
          </div>
          {entry.mergedInto ? <small className="vision-entity-catalog-merged"><GitMerge size={12} />{copy.entityCatalogMergedInto(catalog.entries.find((candidate) => candidate.labelId === entry.mergedInto)?.name ?? entry.mergedInto)}</small> : null}
        </article>
      })}
    </div>
  </section>
}
