import { CheckSquare, Database, RefreshCw, Square, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import { VISION_DERIVED_EVIDENCE_TYPES, type VisionDerivedEvidenceType, type VisionEvidenceSource } from '../../../shared/vision-types'

type VisionEvidenceSourcesProps = {
  copy: LocaleCopy['vision']
  kicker?: string
}

function formatGeneratedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

function sourceKey(source: VisionEvidenceSource): string {
  return `${source.videoPath}\0${source.sourceFingerprint}`
}

export function VisionEvidenceSources({ copy, kicker = 'VISION' }: VisionEvidenceSourcesProps): React.ReactElement {
  const [sources, setSources] = useState<VisionEvidenceSource[]>([])
  const [selectedTypes, setSelectedTypes] = useState<Record<string, VisionDerivedEvidenceType[]>>({})
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = async (): Promise<void> => {
    setIsRefreshing(true)
    setError(null)
    try {
      const nextSources = await window.aiv.listVisionEvidenceSources({ limit: 100, offset: 0 })
      setSources(nextSources)
      setSelectedTypes((current) => {
        const available = new Map(nextSources.map((source) => [sourceKey(source), new Set(VISION_DERIVED_EVIDENCE_TYPES.filter((type) => source.evidenceCounts[type] > 0))]))
        return Object.fromEntries(Object.entries(current).map(([key, types]) => [key, types.filter((type) => available.get(key)?.has(type))]).filter(([, types]) => types.length > 0))
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => { void refresh() }, [])

  const getSelectedTypes = (source: VisionEvidenceSource): Set<VisionDerivedEvidenceType> => new Set(selectedTypes[sourceKey(source)] ?? [])

  const toggleType = (source: VisionEvidenceSource, evidenceType: VisionDerivedEvidenceType): void => {
    if (source.evidenceCounts[evidenceType] <= 0) return
    const key = sourceKey(source)
    setSelectedTypes((current) => {
      const nextTypes = new Set(current[key] ?? [])
      if (nextTypes.has(evidenceType)) nextTypes.delete(evidenceType)
      else nextTypes.add(evidenceType)
      const next = { ...current }
      if (nextTypes.size === 0) delete next[key]
      else next[key] = VISION_DERIVED_EVIDENCE_TYPES.filter((type) => nextTypes.has(type))
      return next
    })
  }

  const toggleSource = (source: VisionEvidenceSource): void => {
    const key = sourceKey(source)
    const available = VISION_DERIVED_EVIDENCE_TYPES.filter((type) => source.evidenceCounts[type] > 0)
    setSelectedTypes((current) => {
      const selected = new Set(current[key] ?? [])
      const allSelected = available.length > 0 && available.every((type) => selected.has(type))
      const next = { ...current }
      if (allSelected || available.length === 0) delete next[key]
      else next[key] = available
      return next
    })
  }

  const selectedTargets = sources.map((source) => ({ videoPath: source.videoPath, evidenceTypes: selectedTypes[sourceKey(source)] ?? [] })).filter((target) => target.evidenceTypes.length > 0)
  const selectedCount = selectedTargets.reduce((count, target) => count + target.evidenceTypes.length, 0)
  const allSelected = sources.length > 0 && sources.every((source) => {
    const available = VISION_DERIVED_EVIDENCE_TYPES.filter((type) => source.evidenceCounts[type] > 0)
    const selected = getSelectedTypes(source)
    return available.length > 0 && available.every((type) => selected.has(type))
  })

  const toggleAll = (): void => {
    if (allSelected) {
      setSelectedTypes({})
      return
    }
    setSelectedTypes(Object.fromEntries(sources.map((source) => [sourceKey(source), VISION_DERIVED_EVIDENCE_TYPES.filter((type) => source.evidenceCounts[type] > 0)]).filter(([, types]) => types.length > 0)))
  }

  const clearSelected = async (): Promise<void> => {
    if (selectedTargets.length === 0 || isClearing) return
    setIsClearing(true)
    setError(null)
    setStatus(null)
    try {
      const response = await window.aiv.clearVisionEvidenceBatch({ targets: selectedTargets })
      if (!response.success) {
        setError(response.message)
        return
      }
      setSelectedTypes({})
      setStatus(copy.evidenceSourcesCleared(response.clearedSources, response.clearedEvidenceCount))
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsClearing(false)
    }
  }

  return <section className="vision-card vision-evidence-sources vision-speaker-evidence-sources" data-testid="vision-evidence-sources" aria-label={copy.evidenceSourcesTitle}>
    <div className="vision-heading"><div><span className="panel-kicker">{kicker}</span><h3>{copy.evidenceSourcesTitle}</h3></div><Database size={17} /></div>
    <p className="vision-evidence-sources-description vision-speaker-evidence-sources-description">{copy.evidenceSourcesDescription}</p>
    <div className="vision-evidence-sources-toolbar vision-speaker-evidence-sources-toolbar">
      <button className="vision-secondary-action" data-testid="vision-evidence-select-all" type="button" onClick={toggleAll} disabled={sources.length === 0 || isRefreshing || isClearing}>{allSelected ? <Square size={13} /> : <CheckSquare size={13} />}{allSelected ? copy.evidenceSourcesClearSelection : copy.evidenceSourcesSelectAll}</button>
      {selectedCount > 0 ? <><span>{copy.evidenceSourcesSelected(selectedCount)}</span><button className="vision-primary-action" data-testid="vision-speaker-clear-selected-evidence" data-evidence-testid="vision-evidence-clear-selected" type="button" onClick={() => void clearSelected()} disabled={isRefreshing || isClearing}><Trash2 size={12} />{isClearing ? copy.evidenceSourcesClearing : copy.evidenceSourcesClear}</button></> : null}
      <button className="vision-secondary-action" type="button" onClick={() => void refresh()} disabled={isRefreshing || isClearing}><RefreshCw size={12} />{isRefreshing ? copy.evidenceSourcesRefreshing : copy.evidenceSourcesRefresh}</button>
    </div>
    {sources.length > 0 ? <div className="vision-evidence-source-list vision-speaker-evidence-source-list">{sources.map((source) => {
      const selected = getSelectedTypes(source)
      const available = VISION_DERIVED_EVIDENCE_TYPES.filter((type) => source.evidenceCounts[type] > 0)
      const sourceSelected = available.length > 0 && available.every((type) => selected.has(type))
      return <article className="vision-evidence-source vision-speaker-evidence-source" key={sourceKey(source)}>
        <div className="vision-evidence-source-copy vision-speaker-evidence-source-copy"><div className="vision-evidence-source-title vision-speaker-evidence-source-title"><input type="checkbox" checked={sourceSelected} onChange={() => toggleSource(source)} disabled={isRefreshing || isClearing} aria-label={source.fileName} /><strong title={source.videoPath}>{source.fileName}</strong></div><small title={source.videoPath}>{source.videoPath}</small><em>{copy.evidenceSourceMeta(available.reduce((count, type) => count + source.evidenceCounts[type], 0), formatGeneratedAt(source.generatedAt))}</em>
          <div className="vision-evidence-source-types">{available.map((evidenceType) => <label key={evidenceType}><input type="checkbox" checked={selected.has(evidenceType)} onChange={() => toggleType(source, evidenceType)} disabled={isRefreshing || isClearing} /><span>{copy.evidenceFilterOptions[evidenceType]} · {source.evidenceCounts[evidenceType]}</span></label>)}</div>
        </div>
      </article>
    })}</div> : <div className="vision-evidence-sources-empty vision-speaker-evidence-sources-empty">{copy.evidenceSourcesEmpty}</div>}
    {status ? <small className="vision-evidence-sources-status vision-speaker-evidence-sources-status">{status}</small> : null}
    {error ? <small className="vision-error">{error}</small> : null}
  </section>
}
