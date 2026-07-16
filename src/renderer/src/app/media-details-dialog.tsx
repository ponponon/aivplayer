import { FileText, Info, X } from 'lucide-react'
import { useEffect, useRef, type ReactElement } from 'react'
import type { MediaProbeMetadata } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'
import {
  flattenProbeEntries,
  formatBitrate,
  formatDuration,
  formatFileSize,
  getStreamTitle
} from './media-details-formatters'
import { MediaDetailsEntryGrid } from './media-details-entry-grid'

type MediaDetailsDialogProps = {
  copy: LocaleCopy
  metadata: MediaProbeMetadata | null
  onClose: () => void
}

export function MediaDetailsDialog({ copy, metadata, onClose }: MediaDetailsDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  useModalFocusTrap(true, dialogRef, '.media-details-close')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const formatDetails = metadata?.details?.format ?? null
  const streamDetails = metadata?.details?.streams ?? []
  const summary = {
    fileSize: formatFileSize(metadata?.fileSizeBytes),
    duration: formatDuration(metadata?.durationSeconds),
    bitrate: formatBitrate(metadata?.overallBitrateKbps)
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="media-details-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="media-details-dialog-title"
        aria-describedby="media-details-dialog-description"
      >
        <div className="download-dialog-header">
          <div>
            <span className="panel-kicker">{copy.panels.infoKicker}</span>
            <h2 id="media-details-dialog-title">{copy.mediaDetailsDialog.title}</h2>
          </div>
          <button className="mini-tool-button media-details-close" type="button" onClick={onClose} title={copy.mediaDetailsDialog.close}>
            <X size={14} />
          </button>
        </div>
        <p id="media-details-dialog-description" className="media-details-description">
          {copy.mediaDetailsDialog.description}
        </p>
        <div className="media-details-summary">
          <div className="media-details-summary-item">
            <span>{copy.mediaDetailsDialog.sourceLabel}</span>
            <strong>{metadata?.probeSource ?? '--'}</strong>
          </div>
          <div className="media-details-summary-item"><span>{copy.panels.fileSize}</span><strong>{summary.fileSize}</strong></div>
          <div className="media-details-summary-item"><span>{copy.panels.duration}</span><strong>{summary.duration}</strong></div>
          <div className="media-details-summary-item"><span>{copy.panels.overallBitrate}</span><strong>{summary.bitrate}</strong></div>
        </div>
        {formatDetails || streamDetails.length > 0 ? (
          <div className="media-details-stack">
            <section className="media-details-card">
              <div className="media-details-card-heading"><FileText size={16} /><span>{copy.mediaDetailsDialog.formatTitle}</span></div>
              {formatDetails ? (
                <MediaDetailsEntryGrid entries={flattenProbeEntries(formatDetails)} probeFieldLabels={copy.probeFieldLabels} />
              ) : (
                <div className="media-details-empty">{copy.mediaDetailsDialog.noDetails}</div>
              )}
            </section>
            <section className="media-details-card">
              <div className="media-details-card-heading"><Info size={16} /><span>{copy.mediaDetailsDialog.streamsTitle}</span></div>
              <div className="media-details-stack">
                {streamDetails.map((stream, index) => (
                  <section className="media-details-subcard" key={`${stream.index ?? index}-${stream.codec_type ?? 'stream'}`}>
                    <div className="media-details-subcard-heading"><strong>{getStreamTitle(stream, index)}</strong></div>
                    <MediaDetailsEntryGrid entries={flattenProbeEntries(stream)} probeFieldLabels={copy.probeFieldLabels} />
                  </section>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="panel-empty">{copy.mediaDetailsDialog.noDetails}</div>
        )}
      </section>
    </div>
  )
}
