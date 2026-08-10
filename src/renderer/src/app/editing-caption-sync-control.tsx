import { ScanSearch } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { EditingCaption } from '../../../shared/editing-types'
import { proposeEditingCaptionAlignment, type EditingCaptionAlignmentPreview } from '../../../core/editing/caption-alignment-preview'
import { formatTime } from '../lib/time'

type Props = {
  caption: EditingCaption | null
  currentTime: number
  durationSeconds: number
  selectedCaptions: readonly EditingCaption[]
  copy: LocaleCopy['editing']
  onMove: (captionId: string, startSeconds: number) => void
  onResize: (captionId: string, startSeconds: number, endSeconds: number) => void
  onSync: (captionIds: readonly string[], sourceStartSeconds: number, sourceEndSeconds: number, targetStartSeconds: number, targetEndSeconds: number) => void
}

export function EditingCaptionSyncControl({ caption, currentTime, durationSeconds, selectedCaptions, copy, onMove, onResize, onSync }: Props): React.ReactElement | null {
  const [targetStartSeconds, setTargetStartSeconds] = useState<number | null>(null)
  const [targetEndSeconds, setTargetEndSeconds] = useState<number | null>(null)
  const [alignmentPreview, setAlignmentPreview] = useState<EditingCaptionAlignmentPreview | null>(null)
  const selectedCaptionKey = selectedCaptions.map((item) => item.id).sort().join('|')
  useEffect(() => {
    setAlignmentPreview(null)
  }, [caption?.id, selectedCaptionKey])
  if (!caption) return null
  const endSeconds = caption.startSeconds + caption.durationSeconds
  const canSetStart = currentTime < endSeconds - 0.1
  const canSetEnd = currentTime > caption.startSeconds + 0.1
  const nudge = (delta: number): void => onMove(caption.id, Math.min(Math.max(0, durationSeconds - caption.durationSeconds), Math.max(0, caption.startSeconds + delta)))
  const orderedCaptions = [...selectedCaptions].sort((left, right) => left.startSeconds - right.startSeconds || left.id.localeCompare(right.id))
  const sourceStartSeconds = orderedCaptions.length > 1 ? orderedCaptions[0].startSeconds : 0
  const sourceEndSeconds = orderedCaptions.length > 1 ? Math.max(...orderedCaptions.map((item) => item.startSeconds + item.durationSeconds)) : 0
  const canApplyMultiSync = orderedCaptions.length > 1 && targetStartSeconds !== null && targetEndSeconds !== null && targetEndSeconds > targetStartSeconds + 0.001
  const alignmentCaptions = orderedCaptions.length > 0 ? orderedCaptions : [caption]
  const formatSignedTime = (seconds: number): string => `${seconds < 0 ? '−' : '+'}${formatTime(Math.abs(seconds))}`
  const createAlignmentPreview = (): void => {
    setAlignmentPreview(proposeEditingCaptionAlignment(alignmentCaptions, currentTime, durationSeconds))
  }
  const applyAlignmentPreview = (): void => {
    if (!alignmentPreview?.canApply) return
    onSync(alignmentPreview.captionIds, alignmentPreview.sourceStartSeconds, alignmentPreview.sourceEndSeconds, alignmentPreview.targetStartSeconds, alignmentPreview.targetEndSeconds)
    setAlignmentPreview(null)
  }
  const applyMultiSync = (): void => {
    if (!canApplyMultiSync || targetStartSeconds === null || targetEndSeconds === null) return
    onSync(orderedCaptions.map((item) => item.id), sourceStartSeconds, sourceEndSeconds, targetStartSeconds, targetEndSeconds)
    setTargetStartSeconds(null)
    setTargetEndSeconds(null)
  }
  return <details className="editing-caption-sync" data-testid="editing-caption-sync">
    <summary className="editing-caption-sync-summary"><ScanSearch size={14} aria-hidden="true" /><span>{copy.subtitleSyncTitle}</span><small>{formatTime(caption.startSeconds)}</small></summary>
    <div className="editing-caption-sync-panel">
      <p className="editing-caption-sync-text">{caption.text}</p>
      <p className="editing-caption-sync-range"><span>{formatTime(caption.startSeconds)}–{formatTime(endSeconds)}</span><small>{copy.subtitleSyncCurrent}: {formatTime(currentTime)}</small></p>
      <div className="editing-caption-sync-actions">
        <button type="button" className="editing-tool-button" onClick={() => nudge(-0.1)} data-testid="editing-caption-sync-left">−0.1s</button>
        <button type="button" className="editing-tool-button" onClick={() => nudge(0.1)} data-testid="editing-caption-sync-right">+0.1s</button>
        <button type="button" className="editing-tool-button" onClick={() => onResize(caption.id, currentTime, endSeconds)} disabled={!canSetStart} data-testid="editing-caption-sync-set-start">{copy.subtitleSyncSetStart}</button>
        <button type="button" className="editing-tool-button" onClick={() => onResize(caption.id, caption.startSeconds, currentTime)} disabled={!canSetEnd} data-testid="editing-caption-sync-set-end">{copy.subtitleSyncSetEnd}</button>
      </div>
      <div className="editing-caption-sync-candidate" data-testid="editing-caption-alignment-preview">
        <strong>{copy.subtitleSyncCandidateTitle}</strong>
        <button type="button" className="editing-tool-button" onClick={createAlignmentPreview} data-testid="editing-caption-alignment-generate">{copy.subtitleSyncCandidateGenerate}</button>
        {alignmentPreview ? <div className="editing-caption-sync-candidate-details"><small>{copy.subtitleSyncCandidateOffset(formatSignedTime(alignmentPreview.offsetSeconds))}</small><small>{copy.subtitleSyncCandidateRange(formatTime(alignmentPreview.targetStartSeconds), formatTime(alignmentPreview.targetEndSeconds))}</small><small>{copy.subtitleSyncCandidateEvidence}</small><small>{copy.subtitleSyncCandidateConfidence}</small>{alignmentPreview.canApply ? null : <small className="editing-caption-sync-candidate-warning">{copy.subtitleSyncCandidateUnsafe}</small>}<button type="button" className="editing-tool-button editing-tool-button-accent" onClick={applyAlignmentPreview} disabled={!alignmentPreview.canApply} data-testid="editing-caption-alignment-apply">{copy.subtitleSyncCandidateApply}</button></div> : null}
      </div>
      {orderedCaptions.length > 1 ? <div className="editing-caption-sync-multi" data-testid="editing-caption-multi-sync"><strong>{copy.subtitleSyncMultiTitle}</strong><small>{copy.subtitleSyncSelected(orderedCaptions.length)} · {copy.subtitleSyncSourceRange(formatTime(sourceStartSeconds), formatTime(sourceEndSeconds))}</small><div className="editing-caption-sync-actions"><button type="button" className="editing-tool-button" onClick={() => setTargetStartSeconds(currentTime)} data-testid="editing-caption-sync-mark-start">{copy.subtitleSyncMarkStart}{targetStartSeconds === null ? '' : ` · ${formatTime(targetStartSeconds)}`}</button><button type="button" className="editing-tool-button" onClick={() => setTargetEndSeconds(currentTime)} data-testid="editing-caption-sync-mark-end">{copy.subtitleSyncMarkEnd}{targetEndSeconds === null ? '' : ` · ${formatTime(targetEndSeconds)}`}</button><button type="button" className="editing-tool-button editing-tool-button-accent" onClick={applyMultiSync} disabled={!canApplyMultiSync} data-testid="editing-caption-sync-apply-multi">{copy.subtitleSyncApply}</button></div>{targetStartSeconds !== null || targetEndSeconds !== null ? <small>{copy.subtitleSyncTargetRange(targetStartSeconds === null ? '—' : formatTime(targetStartSeconds), targetEndSeconds === null ? '—' : formatTime(targetEndSeconds))}</small> : null}</div> : null}
    </div>
  </details>
}
