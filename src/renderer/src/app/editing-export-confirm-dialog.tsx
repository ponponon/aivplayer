import { Download, FolderOpen, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { ClipExportMode } from '../../../shared/clip-export'
import type { EditingVideoClip } from '../../../shared/editing-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { buildTimelineExportDefaultFileName, getTimelineExportPathDirectory, getTimelineExportPathBaseName, joinTimelineExportPath, normalizeTimelineExportFileName } from '../../../shared/timeline-export-path'
import { EditingExportSummary } from './editing-export-summary'
import { useModalFocusTrap } from './use-modal-focus-trap'

const EXPORT_MODES: ClipExportMode[] = ['video', 'external-subtitle', 'burn-subtitle']

type EditingExportConfirmDialogProps = {
  copy: LocaleCopy
  mediaPath: string
  clips: readonly EditingVideoClip[]
  durationSeconds: number
  canvasWidth?: number
  canvasHeight?: number
  hasSubtitle: boolean
  initialMode: ClipExportMode
  onClose: () => void
  onConfirm: (mode: ClipExportMode, outputVideoPath: string) => void
}

export function EditingExportConfirmDialog({ copy, mediaPath, clips, durationSeconds, canvasWidth, canvasHeight, hasSubtitle, initialMode, onClose, onConfirm }: EditingExportConfirmDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const [selectedMode, setSelectedMode] = useState<ClipExportMode>(initialMode)
  const defaultFileName = buildTimelineExportDefaultFileName(mediaPath, clips.length, durationSeconds, selectedMode)
  const previousDefaultFileNameRef = useRef(defaultFileName)
  const [outputDirectory, setOutputDirectory] = useState(() => getTimelineExportPathDirectory(mediaPath))
  const [outputFileName, setOutputFileName] = useState(defaultFileName)
  const [isChoosingOutputPath, setIsChoosingOutputPath] = useState(false)
  const normalizedOutputFileName = normalizeTimelineExportFileName(outputFileName, defaultFileName)
  const outputVideoPath = joinTimelineExportPath(outputDirectory, normalizedOutputFileName)
  useModalFocusTrap(true, dialogRef, '.editing-export-confirm-cancel')

  useEffect(() => {
    if (outputFileName === previousDefaultFileNameRef.current) setOutputFileName(defaultFileName)
    previousDefaultFileNameRef.current = defaultFileName
  }, [defaultFileName, outputFileName])

  useEffect(() => {
    if (!hasSubtitle && selectedMode !== 'video') setSelectedMode('video')
  }, [hasSubtitle, selectedMode])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const chooseOutputPath = async (): Promise<void> => {
    setIsChoosingOutputPath(true)
    try {
      const result = await window.aiv.chooseTimelineExportPath({ mediaPath, clipCount: clips.length, durationSeconds, mode: selectedMode, suggestedPath: outputVideoPath })
      if (result.filePath) {
        setOutputDirectory(getTimelineExportPathDirectory(result.filePath))
        setOutputFileName(getTimelineExportPathBaseName(result.filePath))
      }
    } finally {
      setIsChoosingOutputPath(false)
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section ref={dialogRef} className="clip-export-dialog editing-export-confirm-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="editing-export-confirm-title" aria-describedby="editing-export-confirm-description">
      <div className="download-dialog-header">
        <div><span className="panel-kicker">{copy.editing.kicker}</span><h2 id="editing-export-confirm-title">{copy.editing.export}</h2></div>
        <button className="mini-tool-button" type="button" onClick={onClose} title={copy.clipExportDialog.cancel} aria-label={copy.clipExportDialog.cancel}><X size={14} /></button>
      </div>
      <p id="editing-export-confirm-description" className="clip-export-description">{copy.clipExportDialog.modeTitle}</p>
      <EditingExportSummary clips={clips} durationSeconds={durationSeconds} canvasWidth={canvasWidth} canvasHeight={canvasHeight} summaryLabel={copy.editing.export} durationLabel={copy.panels.duration} clipsLabel={copy.editing.videoTrack} resolutionLabel={copy.panels.resolution} audioLabel={copy.panels.audioStream} muteLabel={copy.controls.mute} volumeLabel={copy.controls.volume} />
      <section className="clip-export-group">
        <div className="clip-export-group-heading"><strong>{copy.clipExportDialog.modeTitle}</strong></div>
        <div className="clip-export-mode-grid" role="group" aria-label={copy.clipExportDialog.modeTitle}>
          {EXPORT_MODES.map((mode) => {
            const option = copy.clipExportDialog.modeOptions[mode]
            const disabled = !hasSubtitle && mode !== 'video'
            return <button key={mode} className={`clip-export-mode-option ${selectedMode === mode ? 'is-selected' : ''}`} type="button" onClick={() => { if (!disabled) setSelectedMode(mode) }} disabled={disabled} aria-pressed={selectedMode === mode}><span className="clip-export-mode-heading"><strong>{option.label}</strong></span><span className="clip-export-mode-description">{option.description}</span></button>
          })}
        </div>
        {!hasSubtitle ? <p className="clip-export-warning">{copy.clipExportDialog.subtitleRequired}</p> : null}
      </section>
      <section className="editing-export-target" data-testid="editing-export-target">
        <div className="clip-export-group-heading"><strong>{copy.clipExportDialog.outputTitle}</strong><small>{copy.clipExportDialog.outputPathHint}</small></div>
        <label className="editing-export-target-field">
          <span>{copy.clipExportDialog.outputFileName}</span>
          <input type="text" value={outputFileName} onChange={(event) => setOutputFileName(event.currentTarget.value)} spellCheck={false} autoComplete="off" aria-label={copy.clipExportDialog.outputFileName} />
        </label>
        <div className="editing-export-target-directory">
          <div className="editing-export-target-directory-copy"><span>{copy.clipExportDialog.outputDirectory}</span><code title={outputDirectory || '.'}>{outputDirectory || '.'}</code></div>
          <button className="settings-secondary-button" type="button" onClick={() => void chooseOutputPath()} disabled={isChoosingOutputPath}><FolderOpen size={13} />{isChoosingOutputPath ? copy.clipExportDialog.choosingOutputPath : copy.clipExportDialog.chooseOutputPath}</button>
        </div>
        <small className="editing-export-target-preview" title={outputVideoPath}>{outputVideoPath}</small>
      </section>
      <div className="clip-export-actions">
        <button className="settings-secondary-button clip-export-action editing-export-confirm-cancel" type="button" onClick={onClose}>{copy.clipExportDialog.cancel}</button>
        <button className="asr-action-button primary clip-export-action" type="button" onClick={() => onConfirm(selectedMode, outputVideoPath)} data-testid="editing-export-confirm"><Download size={14} />{copy.clipExportDialog.export}</button>
      </div>
    </section>
  </div>
}
