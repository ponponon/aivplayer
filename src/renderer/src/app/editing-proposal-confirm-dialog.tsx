import { Check, Clock3, FileText, Scissors, X } from 'lucide-react'
import { useEffect, useRef, type ReactElement } from 'react'
import type { EditingProposal } from '../../../shared/editing-proposal'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatTime } from '../lib/time'
import { useModalFocusTrap } from './use-modal-focus-trap'

type EditingProposalConfirmDialogProps = {
  copy: LocaleCopy['editing']
  proposal: EditingProposal
  onClose: () => void
  onConfirm: () => void
}

function formatRange(startSeconds: number, endSeconds: number): string {
  return `${formatTime(startSeconds)}–${formatTime(endSeconds)}`
}

export function EditingProposalConfirmDialog({ copy, proposal, onClose, onConfirm }: EditingProposalConfirmDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  useModalFocusTrap(true, dialogRef, '.editing-proposal-cancel')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="editing-proposal-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="editing-proposal-title" aria-describedby="editing-proposal-description">
      <div className="download-dialog-header">
        <div><span className="panel-kicker">{copy.kicker}</span><h2 id="editing-proposal-title">{copy.proposalTitle}</h2></div>
        <button className="mini-tool-button" type="button" onClick={onClose} title={copy.proposalCancel} aria-label={copy.proposalCancel} data-testid="editing-proposal-close"><X size={14} /></button>
      </div>
      <p id="editing-proposal-description" className="editing-proposal-description">{copy.proposalDescription}</p>
      <div className="editing-proposal-summary" data-testid="editing-proposal-summary">
        <div><Clock3 size={13} aria-hidden="true" /><span>{copy.proposalDuration}</span><strong>{formatTime(proposal.diff.after.durationSeconds)}</strong><small>{formatTime(proposal.diff.before.durationSeconds)} → {formatTime(proposal.diff.after.durationSeconds)}</small></div>
        <div><Scissors size={13} aria-hidden="true" /><span>{copy.proposalRemovedRanges}</span><strong>{proposal.diff.removedSourceRanges.length}</strong><small>{copy.proposalSourceRangeUnit}</small></div>
        <div><FileText size={13} aria-hidden="true" /><span>{copy.proposalAffectedSegments}</span><strong>{proposal.diff.scriptSegments.length}</strong><small>{copy.proposalSegmentUnit}</small></div>
        <div><FileText size={13} aria-hidden="true" /><span>{copy.proposalAffectedCaptions}</span><strong>{proposal.diff.captions.removedIds.length}</strong><small>{copy.proposalCaptionUnit}</small></div>
      </div>
      <div className="editing-proposal-sections">
        <section className="editing-proposal-section" data-testid="editing-proposal-deletions">
          <div className="editing-proposal-section-heading"><strong>{copy.proposalDeleteTitle}</strong><span>{copy.proposalSourceTime}</span></div>
          <div className="editing-proposal-range-list">
            {proposal.diff.removedSourceRanges.map((range) => <div className="editing-proposal-range is-delete" key={`${range.sourceId}-${range.sourceStartSeconds}-${range.sourceEndSeconds}`}><code>{formatRange(range.sourceStartSeconds, range.sourceEndSeconds)}</code><span>{range.scriptSegmentIds.join(', ')}</span></div>)}
          </div>
        </section>
        <section className="editing-proposal-section" data-testid="editing-proposal-retained">
          <div className="editing-proposal-section-heading"><strong>{copy.proposalRetainedTitle}</strong><span>{copy.proposalSourceTime}</span></div>
          <div className="editing-proposal-range-list">
            {proposal.diff.retainedSourceRanges.map((range) => <div className="editing-proposal-range" key={`${range.sourceId}-${range.sourceStartSeconds}-${range.sourceEndSeconds}`}><code>{formatRange(range.sourceStartSeconds, range.sourceEndSeconds)}</code></div>)}
          </div>
        </section>
        <section className="editing-proposal-section" data-testid="editing-proposal-segments">
          <div className="editing-proposal-section-heading"><strong>{copy.proposalSegmentTitle}</strong><span>{copy.proposalDeleteAfterConfirm}</span></div>
          <div className="editing-proposal-segment-list">
            {proposal.diff.scriptSegments.map((segment) => <div className="editing-proposal-segment" key={segment.id}><div><strong>{segment.text}</strong><small>{formatRange(segment.sourceStartSeconds, segment.sourceEndSeconds)} · {segment.id}</small></div>{segment.translationText ? <span title={segment.translationText}>{segment.translationText}</span> : null}</div>)}
          </div>
        </section>
      </div>
      <p className="editing-proposal-revision"><span>{copy.proposalRevisionLabel}</span><code title={proposal.base.revision}>{proposal.base.revision}</code></p>
      <div className="clip-export-actions editing-proposal-actions">
        <button className="settings-secondary-button clip-export-action editing-proposal-cancel" type="button" onClick={onClose} data-testid="editing-proposal-cancel">{copy.proposalCancel}</button>
        <button className="asr-action-button primary clip-export-action" type="button" onClick={onConfirm} data-testid="editing-proposal-confirm"><Check size={14} />{copy.proposalConfirm}</button>
      </div>
    </section>
  </div>
}
