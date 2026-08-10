import { Download, FolderOpen, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type { TimelineExportMode } from '../../../shared/clip-export'
import type { EditingVideoClip } from '../../../shared/editing-types'
import type { LocaleCopy } from '../../../shared/i18n'
import type { EditingExportAudit, EditingExportAuditIssue } from '../../../core/editing/export-audit'
import { buildTimelineExportDefaultFileName, getTimelineExportPathDirectory, getTimelineExportPathBaseName, joinTimelineExportPath, normalizeTimelineExportFileName } from '../../../shared/timeline-export-path'
import { EditingExportSummary } from './editing-export-summary'
import { FfmpegCapabilityStatus, useFfmpegCapabilities } from './ffmpeg-capability-status'
import { useModalFocusTrap } from './use-modal-focus-trap'

const EXPORT_MODES: TimelineExportMode[] = ['video', 'external-subtitle', 'translation-subtitle', 'subtitle-file', 'translation-file', 'burn-subtitle']

type EditingExportConfirmDialogProps = {
  copy: LocaleCopy
  mediaPath: string
  clips: readonly EditingVideoClip[]
  durationSeconds: number
  canvasWidth?: number
  canvasHeight?: number
  hasSubtitle: boolean
  hasEditableSubtitle: boolean
  hasTranslationSubtitle: boolean
  audit: EditingExportAudit
  initialMode: TimelineExportMode
  onClose: () => void
  onConfirm: (mode: TimelineExportMode, outputVideoPath: string) => void
}

function describeAuditIssue(issue: EditingExportAuditIssue, copy: LocaleCopy['editing']): string {
  const name = issue.sourceName ?? issue.entityId
  switch (issue.code) {
    case 'empty-timeline': return copy.exportAuditEmptyTimeline
    case 'missing-source': return copy.exportAuditMissingSource(name)
    case 'missing-source-file': return copy.exportAuditMissingFile(name)
    case 'invalid-clip-range': return copy.exportAuditInvalidClip(name)
    case 'clip-too-short': return copy.exportAuditShortClip(name)
    case 'invalid-video-block': return copy.exportAuditInvalidVideoBlock(name)
    case 'invalid-graphic': return copy.exportAuditInvalidGraphic
  }
}

export function EditingExportConfirmDialog({ copy, mediaPath, clips, durationSeconds, canvasWidth, canvasHeight, hasSubtitle, hasEditableSubtitle, hasTranslationSubtitle, audit, initialMode, onClose, onConfirm }: EditingExportConfirmDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const [selectedMode, setSelectedMode] = useState<TimelineExportMode>(initialMode)
  const defaultFileName = buildTimelineExportDefaultFileName(mediaPath, clips.length, durationSeconds, selectedMode)
  const previousDefaultFileNameRef = useRef(defaultFileName)
  const [outputDirectory, setOutputDirectory] = useState(() => getTimelineExportPathDirectory(mediaPath))
  const [outputFileName, setOutputFileName] = useState(defaultFileName)
  const [isChoosingOutputPath, setIsChoosingOutputPath] = useState(false)
  const normalizedOutputFileName = normalizeTimelineExportFileName(outputFileName, defaultFileName, selectedMode)
  const outputVideoPath = joinTimelineExportPath(outputDirectory, normalizedOutputFileName)
  const burnInSelected = selectedMode === 'burn-subtitle'
  const { capabilities, isChecking } = useFfmpegCapabilities(burnInSelected)
  const burnInBlocked = burnInSelected && (isChecking || capabilities?.subtitleBurnIn !== true)
  useModalFocusTrap(true, dialogRef, '.editing-export-confirm-cancel')

  useEffect(() => {
    if (outputFileName === previousDefaultFileNameRef.current) setOutputFileName(defaultFileName)
    previousDefaultFileNameRef.current = defaultFileName
  }, [defaultFileName, outputFileName])

  useEffect(() => {
    const selectedModeUnavailable = selectedMode === 'translation-subtitle' || selectedMode === 'translation-file' ? !hasTranslationSubtitle : selectedMode === 'subtitle-file' ? !hasEditableSubtitle : !hasSubtitle && selectedMode !== 'video'
    if (selectedModeUnavailable) setSelectedMode('video')
  }, [hasEditableSubtitle, hasSubtitle, hasTranslationSubtitle, selectedMode])

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
      <section className={`editing-export-audit ${audit.errors.length > 0 ? 'is-error' : 'is-ready'}`} data-testid="editing-export-audit" role={audit.errors.length > 0 ? 'alert' : 'status'}>
        <div className="editing-export-audit-heading"><strong>{copy.editing.exportAuditTitle}</strong><span>{audit.errors.length > 0 ? copy.editing.exportAuditErrorCount(audit.errors.length) : copy.editing.exportAuditReady}</span></div>
        {audit.errors.length > 0 ? <ul>{audit.errors.map((issue) => <li key={`${issue.code}-${issue.entityId}`}>{describeAuditIssue(issue, copy.editing)}</li>)}</ul> : null}
      </section>
      <section className="clip-export-group">
        <div className="clip-export-group-heading"><strong>{copy.clipExportDialog.modeTitle}</strong></div>
        <div className="clip-export-mode-grid" role="group" aria-label={copy.clipExportDialog.modeTitle}>
          {EXPORT_MODES.map((mode) => {
            const option = copy.clipExportDialog.modeOptions[mode]
            const disabled = mode === 'translation-subtitle' || mode === 'translation-file' ? !hasTranslationSubtitle : mode === 'subtitle-file' ? !hasEditableSubtitle : !hasSubtitle && mode !== 'video'
            return <button key={mode} className={`clip-export-mode-option ${selectedMode === mode ? 'is-selected' : ''}`} type="button" onClick={() => { if (!disabled) setSelectedMode(mode) }} disabled={disabled} aria-pressed={selectedMode === mode}><span className="clip-export-mode-heading"><strong>{option.label}</strong></span><span className="clip-export-mode-description">{option.description}</span></button>
          })}
        </div>
        {!hasSubtitle && !hasTranslationSubtitle ? <p className="clip-export-warning">{copy.clipExportDialog.subtitleRequired}</p> : null}
        {hasSubtitle && !hasTranslationSubtitle ? <p className="clip-export-warning">{copy.clipExportDialog.translationSubtitleRequired}</p> : null}
        <FfmpegCapabilityStatus copy={copy.editing} enabled={burnInSelected} capabilities={capabilities} isChecking={isChecking} />
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
        <button className="asr-action-button primary clip-export-action" type="button" onClick={() => onConfirm(selectedMode, outputVideoPath)} disabled={audit.errors.length > 0 || burnInBlocked} data-testid="editing-export-confirm"><Download size={14} />{copy.clipExportDialog.export}</button>
      </div>
    </section>
  </div>
}
