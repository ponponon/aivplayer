import { AudioLines, Play, RefreshCcw } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { SpeakerDiarizationModelStatus, SpeakerDiarizationResult } from '../../../shared/speaker-diarization-types'
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

export function VisionSpeakerDiarization({ copy, mediaPath, onSeek }: VisionSpeakerDiarizationProps): React.ReactElement {
  const [status, setStatus] = useState<SpeakerDiarizationModelStatus | null>(null)
  const [result, setResult] = useState<SpeakerDiarizationResult | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
  }, [mediaPath])

  const run = (): void => {
    if (!mediaPath || !status?.available || isRunning) return
    setError(null)
    setResult(null)
    setIsRunning(true)
    void window.aiv.runSpeakerDiarization({ mediaPath }).then((response) => {
      if (!response.success || !response.result) {
        setError(response.message)
        return
      }
      setStatus(response.status)
      setResult(response.result)
    }).catch((reason: unknown) => {
      setError(reason instanceof Error ? reason.message : String(reason))
    }).finally(() => setIsRunning(false))
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
      {result.segments.length > 0 ? <div className="vision-speaker-results">{result.segments.map((segment, index) => <button className="vision-speaker-segment" type="button" key={`${segment.startSeconds}-${segment.endSeconds}-${index}`} onClick={() => onSeek(segment.startSeconds)} title={copy.speakerSegment(segment.speakerId, formatTime(segment.startSeconds), formatTime(segment.endSeconds))}><span>{copy.speakerSegment(segment.speakerId, formatTime(segment.startSeconds), formatTime(segment.endSeconds))}</span><small>{formatTime(segment.startSeconds)}–{formatTime(segment.endSeconds)}</small></button>)}</div> : <p className="vision-speaker-empty">{copy.speakerNoSegments}</p>}
    </> : null}
    {error ? <small className="vision-error">{error}</small> : null}
  </section>
}
