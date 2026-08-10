import { CheckSquare, Database, RefreshCw, Square, Trash2 } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { SpeakerDiarizationEvidenceSource } from '../../../shared/speaker-diarization-types'

type VisionSpeakerEvidenceSourcesProps = {
  copy: LocaleCopy['vision']
}

function formatGeneratedAt(timestamp: number): string {
  return new Date(timestamp).toLocaleString()
}

export function VisionSpeakerEvidenceSources({ copy }: VisionSpeakerEvidenceSourcesProps): React.ReactElement {
  const [sources, setSources] = useState<SpeakerDiarizationEvidenceSource[]>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isClearing, setIsClearing] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const allSelected = sources.length > 0 && sources.every((source) => selectedPaths.has(source.videoPath))
  const selectedSources = sources.filter((source) => selectedPaths.has(source.videoPath))

  const refresh = async (): Promise<void> => {
    setIsRefreshing(true)
    setError(null)
    try {
      const nextSources = await window.aiv.listSpeakerDiarizationEvidenceSources({ limit: 100, offset: 0 })
      setSources(nextSources)
      setSelectedPaths((current) => {
        const availablePaths = new Set(nextSources.map((source) => source.videoPath))
        return new Set([...current].filter((path) => availablePaths.has(path)))
      })
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsRefreshing(false)
    }
  }

  useEffect(() => {
    void refresh()
  }, [])

  const toggleSelection = (videoPath: string): void => {
    setSelectedPaths((current) => {
      const next = new Set(current)
      if (next.has(videoPath)) next.delete(videoPath)
      else next.add(videoPath)
      return next
    })
  }

  const toggleAll = (): void => {
    setSelectedPaths(allSelected ? new Set() : new Set(sources.map((source) => source.videoPath)))
  }

  const clearSelected = async (): Promise<void> => {
    if (selectedSources.length === 0 || isClearing) return
    setIsClearing(true)
    setError(null)
    setStatus(null)
    try {
      const response = await window.aiv.clearSpeakerDiarizationEvidenceBatch({ mediaPaths: selectedSources.map((source) => source.videoPath) })
      if (!response.success) {
        setError(response.message)
        return
      }
      setSelectedPaths(new Set())
      setStatus(copy.speakerEvidenceSourcesCleared(response.clearedSources, response.clearedEvidenceCount))
      await refresh()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason))
    } finally {
      setIsClearing(false)
    }
  }

  return <section className="vision-card vision-speaker-evidence-sources" data-testid="vision-speaker-evidence-sources" aria-label={copy.speakerEvidenceSourcesTitle}>
    <div className="vision-heading"><div><span className="panel-kicker">{copy.speakerKicker}</span><h3>{copy.speakerEvidenceSourcesTitle}</h3></div><Database size={17} /></div>
    <p className="vision-speaker-evidence-sources-description">{copy.speakerEvidenceSourcesDescription}</p>
    <div className="vision-speaker-evidence-sources-toolbar">
      <button className="vision-secondary-action" data-testid="vision-speaker-select-all-evidence" type="button" onClick={toggleAll} disabled={sources.length === 0 || isRefreshing || isClearing}>{allSelected ? <Square size={13} /> : <CheckSquare size={13} />}{allSelected ? copy.speakerEvidenceSourcesClearSelection : copy.speakerEvidenceSourcesSelectAll}</button>
      {selectedSources.length > 0 ? <><span>{copy.speakerEvidenceSourcesSelected(selectedSources.length)}</span><button className="vision-primary-action" data-testid="vision-speaker-clear-selected-evidence" type="button" onClick={() => void clearSelected()} disabled={isRefreshing || isClearing}><Trash2 size={12} />{isClearing ? copy.speakerEvidenceSourcesClearing : copy.speakerEvidenceSourcesClear}</button></> : null}
      <button className="vision-secondary-action" type="button" onClick={() => void refresh()} disabled={isRefreshing || isClearing}><RefreshCw size={12} />{isRefreshing ? copy.speakerEvidenceSourcesRefreshing : copy.speakerEvidenceSourcesRefresh}</button>
    </div>
    {sources.length > 0 ? <div className="vision-speaker-evidence-source-list">{sources.map((source) => <article className="vision-speaker-evidence-source" key={`${source.videoPath}:${source.sourceFingerprint}`}>
      <div className="vision-speaker-evidence-source-copy"><div className="vision-speaker-evidence-source-title"><input type="checkbox" checked={selectedPaths.has(source.videoPath)} onChange={() => toggleSelection(source.videoPath)} disabled={isRefreshing || isClearing} aria-label={source.fileName} /><strong title={source.videoPath}>{source.fileName}</strong></div><small title={source.videoPath}>{source.videoPath}</small><em>{copy.speakerEvidenceSourceMeta(source.evidenceCount, formatGeneratedAt(source.generatedAt))}</em></div>
    </article>)}</div> : <div className="vision-speaker-evidence-sources-empty">{copy.speakerEvidenceSourcesEmpty}</div>}
    {status ? <small className="vision-speaker-evidence-sources-status">{status}</small> : null}
    {error ? <small className="vision-error">{error}</small> : null}
  </section>
}
