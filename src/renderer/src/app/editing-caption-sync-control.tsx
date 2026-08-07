import { ScanSearch } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { EditingCaption } from '../../../shared/editing-types'
import { formatTime } from '../lib/time'

type Props = {
  caption: EditingCaption | null
  currentTime: number
  durationSeconds: number
  copy: LocaleCopy['editing']
  onMove: (captionId: string, startSeconds: number) => void
  onResize: (captionId: string, startSeconds: number, endSeconds: number) => void
}

export function EditingCaptionSyncControl({ caption, currentTime, durationSeconds, copy, onMove, onResize }: Props): React.ReactElement | null {
  if (!caption) return null
  const endSeconds = caption.startSeconds + caption.durationSeconds
  const canSetStart = currentTime < endSeconds - 0.1
  const canSetEnd = currentTime > caption.startSeconds + 0.1
  const nudge = (delta: number): void => onMove(caption.id, Math.min(Math.max(0, durationSeconds - caption.durationSeconds), Math.max(0, caption.startSeconds + delta)))
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
    </div>
  </details>
}
