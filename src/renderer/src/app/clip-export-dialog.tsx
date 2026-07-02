import { Download, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ClipExportLengthSeconds, ClipExportMode } from '../../../shared/clip-export'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'

type ClipExportDialogProps = {
  copy: LocaleCopy
  hasSubtitle: boolean
  initialLengthSeconds: ClipExportLengthSeconds
  initialMode: ClipExportMode
  onClose: () => void
  onConfirm: (selection: { durationSeconds: ClipExportLengthSeconds; mode: ClipExportMode }) => void
}

const clipExportLengthOptions: ClipExportLengthSeconds[] = [15, 30, 60]
const clipExportModes: ClipExportMode[] = ['video', 'external-subtitle', 'burn-subtitle']

export function ClipExportDialog(props: ClipExportDialogProps): ReactElement {
  const { copy, hasSubtitle, initialLengthSeconds, initialMode, onClose, onConfirm } = props
  const [selectedLengthSeconds, setSelectedLengthSeconds] = useState<ClipExportLengthSeconds>(initialLengthSeconds)
  const [selectedMode, setSelectedMode] = useState<ClipExportMode>(initialMode)
  const dialogRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    if (hasSubtitle) {
      return
    }

    if (selectedMode !== 'video') {
      setSelectedMode('video')
    }
  }, [hasSubtitle, selectedMode])

  useModalFocusTrap(true, dialogRef, '.clip-export-action')

  const canExport = hasSubtitle || selectedMode === 'video'

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
        className="clip-export-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="clip-export-dialog-title"
        aria-describedby="clip-export-dialog-description"
      >
        <div className="download-dialog-header">
          <div>
            <span className="panel-kicker">{copy.asrPanel.subtitleTools}</span>
            <h2 id="clip-export-dialog-title">{copy.clipExportDialog.title}</h2>
          </div>
          <button className="mini-tool-button" type="button" onClick={onClose} title={copy.clipExportDialog.cancel}>
            <X size={14} />
          </button>
        </div>

        <p id="clip-export-dialog-description" className="clip-export-description">
          {copy.clipExportDialog.description}
        </p>

        <section className="clip-export-group">
          <div className="clip-export-group-heading">
            <strong>{copy.clipExportDialog.lengthTitle}</strong>
          </div>
          <div className="clip-export-length-grid">
            {clipExportLengthOptions.map((lengthSeconds) => {
              const isSelected = selectedLengthSeconds === lengthSeconds

              return (
                <button
                  key={lengthSeconds}
                  className={`clip-export-length-option ${isSelected ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => setSelectedLengthSeconds(lengthSeconds)}
                  aria-pressed={isSelected}
                >
                  {copy.clipExportDialog.lengthOptions[lengthSeconds]}
                </button>
              )
            })}
          </div>
        </section>

        <section className="clip-export-group">
          <div className="clip-export-group-heading">
            <strong>{copy.clipExportDialog.modeTitle}</strong>
          </div>
          <div className="clip-export-mode-grid" role="group" aria-label={copy.clipExportDialog.modeTitle}>
            {clipExportModes.map((mode) => {
              const option = copy.clipExportDialog.modeOptions[mode]
              const isSelected = selectedMode === mode
              const isDisabled = !hasSubtitle && mode !== 'video'

              return (
                <button
                  key={mode}
                  className={`clip-export-mode-option ${isSelected ? 'is-selected' : ''}`}
                  type="button"
                  onClick={() => {
                    if (!isDisabled) {
                      setSelectedMode(mode)
                    }
                  }}
                  disabled={isDisabled}
                  aria-pressed={isSelected}
                >
                  <span className="clip-export-mode-heading">
                    <strong>{option.label}</strong>
                  </span>
                  <span className="clip-export-mode-description">{option.description}</span>
                </button>
              )
            })}
          </div>
          {!hasSubtitle ? <p className="clip-export-warning">{copy.clipExportDialog.subtitleRequired}</p> : null}
        </section>

        <div className="clip-export-actions">
          <button className="settings-secondary-button clip-export-action" type="button" onClick={onClose}>
            {copy.clipExportDialog.cancel}
          </button>
          <button
            className="asr-action-button primary clip-export-action"
            type="button"
            onClick={() =>
              onConfirm({
                durationSeconds: selectedLengthSeconds,
                mode: selectedMode
              })
            }
            disabled={!canExport}
          >
            <Download size={14} />
            {copy.clipExportDialog.export}
          </button>
        </div>
      </section>
    </div>
  )
}
