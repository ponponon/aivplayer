import { Download, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { MIN_CLIP_DURATION_SECONDS, type ClipExportMode } from '../../../shared/clip-export'
import type { LocaleCopy } from '../../../shared/i18n'
import { normalizeClipSelection, type ClipSelection } from './clip-editor'
import { ClipEditorPreview } from './clip-editor-preview'
import { ClipEditorTimeline } from './clip-editor-timeline'
import { useModalFocusTrap } from './use-modal-focus-trap'

type ClipExportDialogProps = {
  copy: LocaleCopy
  mediaUrl: string
  mediaDurationSeconds: number
  currentTimeSeconds: number
  hasSubtitle: boolean
  initialStartSeconds: number
  initialEndSeconds: number
  initialMode: ClipExportMode
  onClose: () => void
  onConfirm: (selection: { startSeconds: number; durationSeconds: number; mode: ClipExportMode }) => void
}

const clipExportModes: ClipExportMode[] = ['video', 'external-subtitle', 'burn-subtitle']

export function ClipExportDialog(props: ClipExportDialogProps): ReactElement {
  const { copy, mediaUrl, mediaDurationSeconds, currentTimeSeconds, hasSubtitle, initialStartSeconds, initialEndSeconds, initialMode, onClose, onConfirm } = props
  const initialSelection = normalizeClipSelection(initialStartSeconds, initialEndSeconds, mediaDurationSeconds)
  const [timelineDurationSeconds, setTimelineDurationSeconds] = useState(Math.max(0, mediaDurationSeconds))
  const [selection, setSelection] = useState<ClipSelection>(initialSelection)
  const [selectedMode, setSelectedMode] = useState<ClipExportMode>(initialMode)
  const dialogRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const nextDuration = Math.max(0, mediaDurationSeconds)
    setTimelineDurationSeconds(nextDuration)
    setSelection(normalizeClipSelection(initialStartSeconds, initialEndSeconds, nextDuration))
  }, [mediaUrl, mediaDurationSeconds, initialStartSeconds, initialEndSeconds])

  useEffect(() => {
    if (!hasSubtitle && selectedMode !== 'video') setSelectedMode('video')
  }, [hasSubtitle, selectedMode])

  useModalFocusTrap(true, dialogRef, '.clip-editor-preview-button')

  const canExport = timelineDurationSeconds > 0 && selection.endSeconds - selection.startSeconds >= MIN_CLIP_DURATION_SECONDS
  const updateSelection = (startSeconds: number, endSeconds: number): void => setSelection(normalizeClipSelection(startSeconds, endSeconds, timelineDurationSeconds))

  const handleDurationDetected = (durationSeconds: number): void => {
    if (Math.abs(durationSeconds - timelineDurationSeconds) <= 0.05) return
    setTimelineDurationSeconds(durationSeconds)
    setSelection((current) => normalizeClipSelection(current.startSeconds, current.endSeconds, durationSeconds))
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={dialogRef} className="clip-export-dialog clip-editor-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="clip-export-dialog-title" aria-describedby="clip-export-dialog-description">
        <div className="download-dialog-header">
          <div><span className="panel-kicker">{copy.asrPanel.subtitleTools}</span><h2 id="clip-export-dialog-title">{copy.clipExportDialog.title}</h2></div>
          <button className="mini-tool-button" type="button" onClick={onClose} title={copy.clipExportDialog.cancel}><X size={14} /></button>
        </div>
        <p id="clip-export-dialog-description" className="clip-export-description">{copy.clipExportDialog.description}</p>
        <ClipEditorPreview copy={copy} mediaUrl={mediaUrl} selection={selection} canPreview={canExport} onDurationDetected={handleDurationDetected} />
        <ClipEditorTimeline copy={copy} timelineDurationSeconds={timelineDurationSeconds} currentTimeSeconds={currentTimeSeconds} selection={selection} canExport={canExport} onSelectionChange={updateSelection} />
        <section className="clip-export-group">
          <div className="clip-export-group-heading"><strong>{copy.clipExportDialog.modeTitle}</strong></div>
          <div className="clip-export-mode-grid" role="group" aria-label={copy.clipExportDialog.modeTitle}>
            {clipExportModes.map((mode) => {
              const option = copy.clipExportDialog.modeOptions[mode]
              const isDisabled = !hasSubtitle && mode !== 'video'
              return <button key={mode} className={`clip-export-mode-option ${selectedMode === mode ? 'is-selected' : ''}`} type="button" onClick={() => { if (!isDisabled) setSelectedMode(mode) }} disabled={isDisabled} aria-pressed={selectedMode === mode}><span className="clip-export-mode-heading"><strong>{option.label}</strong></span><span className="clip-export-mode-description">{option.description}</span></button>
            })}
          </div>
          {!hasSubtitle ? <p className="clip-export-warning">{copy.clipExportDialog.subtitleRequired}</p> : null}
        </section>
        <div className="clip-export-actions">
          <button className="settings-secondary-button clip-export-action" type="button" onClick={onClose}>{copy.clipExportDialog.cancel}</button>
          <button className="asr-action-button primary clip-export-action" type="button" onClick={() => onConfirm({ startSeconds: selection.startSeconds, durationSeconds: selection.endSeconds - selection.startSeconds, mode: selectedMode })} disabled={!canExport}><Download size={14} />{copy.clipExportDialog.export}</button>
        </div>
      </section>
    </div>
  )
}
