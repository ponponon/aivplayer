import { FileText, Info, X } from 'lucide-react'
import { useEffect, useRef, type ReactElement } from 'react'
import type { MediaProbeDetailObject, MediaProbeMetadata } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatTime } from '../lib/time'
import { useModalFocusTrap } from './use-modal-focus-trap'

type MediaDetailsDialogProps = {
  copy: LocaleCopy
  metadata: MediaProbeMetadata | null
  onClose: () => void
}

type MediaProbeEntry = {
  key: string
  value: unknown
}

function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return '--'
  }

  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }

  const sizeInMb = bytes / (1024 * 1024)
  return sizeInMb >= 10 ? `${sizeInMb.toFixed(1)} MB` : `${sizeInMb.toFixed(2)} MB`
}

function formatBitrate(kbps: number | null | undefined): string {
  if (kbps == null || !Number.isFinite(kbps) || kbps < 0) {
    return '--'
  }

  return `${Math.round(kbps)} kb/s`
}

function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return '--'
  }

  return formatTime(seconds)
}

function formatDetailValue(value: unknown): string {
  if (value == null) {
    return '--'
  }

  if (typeof value === 'string') {
    return value.length > 0 ? value : '--'
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '--'
    }

    const rounded = Math.round(value * 1000) / 1000
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(3).replace(/\.?0+$/, '')
  }

  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }

  return String(value)
}

function humanizeKey(key: string): string {
  return key
    .replace(/\[(\d+)\]/g, ' [$1]')
    .split('.')
    .map((part) => {
      const normalized = part.replace(/_/g, ' ').trim()
      if (normalized.length === 0) {
        return normalized
      }

      return normalized.replace(/\b[a-z]/gi, (character) => character.toUpperCase())
    })
    .join(' · ')
}

function flattenProbeEntries(value: unknown, prefix = ''): MediaProbeEntry[] {
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return prefix ? [{ key: prefix, value: '[]' }] : []
    }

    return value.flatMap((item, index) => {
      const nextPrefix = prefix ? `${prefix}[${index}]` : `[${index}]`
      return flattenProbeEntries(item, nextPrefix)
    })
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)

    if (entries.length === 0) {
      return prefix ? [{ key: prefix, value: '{}' }] : []
    }

    return entries.flatMap(([key, item]) => {
      const nextPrefix = prefix ? `${prefix}.${key}` : key
      return flattenProbeEntries(item, nextPrefix)
    })
  }

  return prefix ? [{ key: prefix, value }] : []
}

function renderProbeEntries(entries: MediaProbeEntry[]): ReactElement {
  return (
    <div className="media-details-grid">
      {entries.map((entry) => (
        <div className="media-details-item" key={entry.key}>
          <span>{humanizeKey(entry.key)}</span>
          <strong title={formatDetailValue(entry.value)}>{formatDetailValue(entry.value)}</strong>
        </div>
      ))}
    </div>
  )
}

function getStreamTitle(stream: MediaProbeDetailObject, index: number): string {
  const codecType = typeof stream.codec_type === 'string' && stream.codec_type.trim().length > 0 ? stream.codec_type.trim() : 'stream'
  return `Stream #${index + 1} · ${codecType}`
}

export function MediaDetailsDialog(props: MediaDetailsDialogProps): ReactElement {
  const { copy, metadata, onClose } = props
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
  const summaryFileSize = formatFileSize(metadata?.fileSizeBytes)
  const summaryDuration = formatDuration(metadata?.durationSeconds)
  const summaryBitrate = formatBitrate(metadata?.overallBitrateKbps)

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
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
          <div className="media-details-summary-item">
            <span>{copy.panels.fileSize}</span>
            <strong>{summaryFileSize}</strong>
          </div>
          <div className="media-details-summary-item">
            <span>{copy.panels.duration}</span>
            <strong>{summaryDuration}</strong>
          </div>
          <div className="media-details-summary-item">
            <span>{copy.panels.overallBitrate}</span>
            <strong>{summaryBitrate}</strong>
          </div>
        </div>

        {formatDetails || streamDetails.length > 0 ? (
          <div className="media-details-stack">
            <section className="media-details-card">
              <div className="media-details-card-heading">
                <FileText size={16} />
                <span>{copy.mediaDetailsDialog.formatTitle}</span>
              </div>
              {formatDetails ? renderProbeEntries(flattenProbeEntries(formatDetails)) : <div className="media-details-empty">{copy.mediaDetailsDialog.noDetails}</div>}
            </section>

            <section className="media-details-card">
              <div className="media-details-card-heading">
                <Info size={16} />
                <span>{copy.mediaDetailsDialog.streamsTitle}</span>
              </div>
              <div className="media-details-stack">
                {streamDetails.map((stream, index) => (
                  <section className="media-details-subcard" key={`${stream.index ?? index}-${stream.codec_type ?? 'stream'}`}>
                    <div className="media-details-subcard-heading">
                      <strong>{getStreamTitle(stream, index)}</strong>
                    </div>
                    {renderProbeEntries(flattenProbeEntries(stream))}
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
