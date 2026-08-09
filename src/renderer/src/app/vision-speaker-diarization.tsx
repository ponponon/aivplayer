import { AudioLines, Play, RefreshCcw, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SpeakerDiarizationModelStatus, SpeakerDiarizationResult } from '../../../shared/speaker-diarization-types'
import type { SpeakerDiarizationCatalog } from '../../../shared/speaker-diarization-catalog-types'
import type { LocaleCopy } from '../../../shared/i18n'

type VisionSpeakerDiarizationProps = {
  copy: LocaleCopy['vision']
  mediaPath: string | null
  onSeek: (seconds: number) => void
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds))
  const minutes = Math.floor(safeSeconds / 60)
  const remainder = safeSeconds % 60
  return `${minutes}:${String(remainder).padStart(2, '0')}`
}

function getSpeakerCount(result: SpeakerDiarizationResult | null): number {
  return result ? new Set(result.segments.map((segment) => segment.speakerId)).size : 0
}

type SpeakerDraft = {
  name: string
  aliases: string
}

function getSpeakerIds(result: SpeakerDiarizationResult | null): number[] {
  return result ? [...new Set(result.segments.map((segment) => segment.speakerId))].sort((left, right) => left - right) : []
}

function getSpeakerEntry(catalog: SpeakerDiarizationCatalog | null, sourceFingerprint: string | null, speakerId: number) {
  return catalog?.sources.find((source) => source.sourceFingerprint === sourceFingerprint)?.entries.find((entry) => entry.speakerId === speakerId) ?? null
}

export function VisionSpeakerDiarization({ copy, mediaPath, onSeek }: VisionSpeakerDiarizationProps): React.ReactElement {
  const [status, setStatus] = useState<SpeakerDiarizationModelStatus | null>(null)
  const [result, setResult] = useState<SpeakerDiarizationResult | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [evidenceStatus, setEvidenceStatus] = useState<string | null>(null)
  const [evidenceSaved, setEvidenceSaved] = useState<boolean | null>(null)
  const [catalog, setCatalog] = useState<SpeakerDiarizationCatalog | null>(null)
  const [sourceFingerprint, setSourceFingerprint] = useState<string | null>(null)
  const [speakerDrafts, setSpeakerDrafts] = useState<Record<number, SpeakerDraft>>({})
  const [savingSpeakerId, setSavingSpeakerId] = useState<number | null>(null)
  const [labelStatus, setLabelStatus] = useState<string | null>(null)

  const refreshStatus = (): void => {
    setIsRefreshing(true)
    void window.aiv.getSpeakerDiarizationStatus().then(setStatus).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsRefreshing(false))
  }

  useEffect(() => {
    refreshStatus()
  }, [])

  useEffect(() => {
    setResult(null)
    setError(null)
    setEvidenceStatus(null)
    setEvidenceSaved(null)
    setCatalog(null)
    setSourceFingerprint(null)
    setSpeakerDrafts({})
    setLabelStatus(null)
  }, [mediaPath])

  useEffect(() => {
    if (!result || !sourceFingerprint) {
      setSpeakerDrafts({})
      return
    }
    setSpeakerDrafts(Object.fromEntries(getSpeakerIds(result).map((speakerId) => {
      const entry = getSpeakerEntry(catalog, sourceFingerprint, speakerId)
      return [speakerId, { name: entry?.name ?? copy.speakerLabelDefault(speakerId), aliases: entry?.aliases.join(', ') ?? '' }]
    })))
  }, [catalog, copy, result, sourceFingerprint])

  const run = (): void => {
    if (!mediaPath || !status?.available || isRunning) return
    setError(null)
    setResult(null)
    setEvidenceStatus(null)
    setEvidenceSaved(null)
    setIsRunning(true)
    void window.aiv.runSpeakerDiarization({ mediaPath }).then((response) => {
      if (!response.success || !response.result) {
        setError(response.message)
        return
      }
      setStatus(response.status)
      setResult(response.result)
      setSourceFingerprint(response.sourceFingerprint ?? null)
      setEvidenceSaved(response.evidencePersisted)
      setEvidenceStatus(response.evidencePersisted
        ? copy.speakerEvidenceSaved(response.evidenceCount)
        : response.evidenceMessage
            ? copy.speakerEvidenceSaveFailed(response.evidenceMessage)
            : null)
      setLabelStatus(null)
      if (response.sourceFingerprint) {
        void window.aiv.getSpeakerDiarizationCatalog().then(setCatalog).catch((reason: unknown) => {
          setError(reason instanceof Error ? reason.message : String(reason))
        })
      }
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsRunning(false))
  }

  const saveSpeakerLabel = (speakerId: number): void => {
    const draft = speakerDrafts[speakerId]
    if (!mediaPath || !sourceFingerprint || !draft?.name.trim() || savingSpeakerId !== null) return
    setSavingSpeakerId(speakerId)
    setLabelStatus(null)
    void window.aiv.updateSpeakerDiarizationCatalog({
      sourceFingerprint,
      videoPath: mediaPath,
      fileName: mediaPath.split(/[\\/]/).pop() ?? mediaPath,
      speakerId,
      name: draft.name,
      aliases: draft.aliases.split(',').map((alias) => alias.trim()).filter(Boolean)
    }).then((nextCatalog) => {
      setCatalog(nextCatalog)
      setLabelStatus(copy.speakerLabelSaved)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setSavingSpeakerId(null))
  }

  const capabilityMessage = status === null
    ? copy.speakerChecking
    : status.available
      ? copy.speakerReady
      : status.message || copy.speakerUnavailable

  return <section className="vision-card vision-speaker-card" data-testid="vision-speaker-diarization" data-status={status?.available ? 'ready' : 'unavailable'}>
    <div className="vision-heading"><div><span className="panel-kicker">{copy.speakerKicker}</span><h3>{copy.speakerTitle}</h3></div><AudioLines size={17} /></div>
    <p className="vision-speaker-description">{copy.speakerDescription}</p>
    <div className={`vision-speaker-capability${status?.available ? ' is-ready' : ''}`} role="status"><span>{capabilityMessage}</span><small>{mediaPath ? mediaPath.split(/[\\/]/).pop() : copy.speakerNoMedia}</small></div>
    <div className="vision-index-actions">
      <button className="vision-primary-action" data-testid="vision-speaker-run" type="button" onClick={run} disabled={!mediaPath || !status?.available || isRunning}><Play size={14} />{isRunning ? copy.speakerRunning : copy.speakerRun}</button>
      <button className="vision-secondary-action" data-testid="vision-speaker-refresh" type="button" onClick={refreshStatus} disabled={isRefreshing || isRunning}><RefreshCcw size={14} />{isRefreshing ? copy.speakerRefreshing : copy.speakerRefresh}</button>
    </div>
    {result ? <>
      <div className="vision-speaker-summary" role="status">{copy.speakerCompleted(result.segments.length, getSpeakerCount(result), result.sampleRate)}</div>
      {result.segments.length > 0 ? <div className="vision-speaker-results">{result.segments.map((segment, index) => {
        const entry = getSpeakerEntry(catalog, sourceFingerprint, segment.speakerId)
        const fallbackLabel = copy.speakerSegment(segment.speakerId, formatTime(segment.startSeconds), formatTime(segment.endSeconds))
        const label = entry ? copy.speakerNamedSegment(entry.name, formatTime(segment.startSeconds), formatTime(segment.endSeconds)) : fallbackLabel
        return <button className="vision-speaker-segment" type="button" key={`${segment.startSeconds}-${segment.endSeconds}-${index}`} onClick={() => onSeek(segment.startSeconds)} title={label}><span>{label}</span><small>{formatTime(segment.startSeconds)}–{formatTime(segment.endSeconds)}</small></button>
      })}</div> : <p className="vision-speaker-empty">{copy.speakerNoSegments}</p>}
      {sourceFingerprint ? <div className="vision-speaker-labels">
        <div className="vision-speaker-labels-heading"><div><strong>{copy.speakerLabelsTitle}</strong><small>{copy.speakerLabelsDescription}</small></div></div>
        <div className="vision-speaker-label-list">{getSpeakerIds(result).map((speakerId) => {
          const entry = getSpeakerEntry(catalog, sourceFingerprint, speakerId)
          const draft = speakerDrafts[speakerId] ?? { name: entry?.name ?? copy.speakerLabelDefault(speakerId), aliases: entry?.aliases.join(', ') ?? '' }
          const saving = savingSpeakerId === speakerId
          return <div className="vision-speaker-label-row" key={speakerId}>
            <div className="vision-speaker-label-meta"><strong>{copy.speakerLabelDefault(speakerId)}</strong><small>{entry?.name ?? copy.speakerLabelUnassigned}</small></div>
            <input className="vision-speaker-label-input" value={draft.name} onChange={(event) => setSpeakerDrafts((current) => ({ ...current, [speakerId]: { ...draft, name: event.target.value } }))} placeholder={copy.speakerLabelNamePlaceholder} aria-label={copy.speakerLabelNamePlaceholder} />
            <input className="vision-speaker-label-input" value={draft.aliases} onChange={(event) => setSpeakerDrafts((current) => ({ ...current, [speakerId]: { ...draft, aliases: event.target.value } }))} placeholder={copy.speakerLabelAliasesPlaceholder} aria-label={copy.speakerLabelAliasesPlaceholder} />
            <button className="vision-secondary-action" type="button" disabled={savingSpeakerId !== null || !draft.name.trim()} onClick={() => saveSpeakerLabel(speakerId)}><Save size={12} />{saving ? copy.speakerLabelSaving : copy.speakerLabelSave}</button>
          </div>
        })}</div>
        {labelStatus ? <small className="vision-speaker-label-status">{labelStatus}</small> : null}
      </div> : null}
      {evidenceStatus ? <small className={`vision-speaker-evidence-status${evidenceSaved ? ' is-saved' : ''}`}>{evidenceStatus}</small> : null}
    </> : null}
    {error ? <small className="vision-error">{error}</small> : null}
  </section>
}
