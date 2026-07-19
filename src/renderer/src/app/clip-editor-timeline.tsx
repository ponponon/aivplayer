import { RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'
import { MIN_CLIP_DURATION_SECONDS, type ClipExportLengthSeconds } from '../../../shared/clip-export'
import type { LocaleCopy } from '../../../shared/i18n'
import { formatClipTime, roundClipTime, type ClipSelection } from './clip-editor'

type ClipEditorTimelineProps = {
  copy: LocaleCopy
  timelineDurationSeconds: number
  currentTimeSeconds: number
  selection: ClipSelection
  canExport: boolean
  onSelectionChange: (startSeconds: number, endSeconds: number) => void
}

const clipExportLengthOptions: ClipExportLengthSeconds[] = [15, 30, 60]

export function ClipEditorTimeline(props: ClipEditorTimelineProps): ReactElement {
  const { copy, timelineDurationSeconds, currentTimeSeconds, selection, canExport, onSelectionChange } = props
  const selectedDurationSeconds = Math.max(0, selection.endSeconds - selection.startSeconds)
  const startPercent = timelineDurationSeconds > 0 ? (selection.startSeconds / timelineDurationSeconds) * 100 : 0
  const selectionWidthPercent = timelineDurationSeconds > 0 ? (selectedDurationSeconds / timelineDurationSeconds) * 100 : 0
  const setStartFromCurrentTime = (): void => onSelectionChange(currentTimeSeconds, selection.endSeconds)
  const setEndFromCurrentTime = (): void => onSelectionChange(selection.startSeconds, currentTimeSeconds)
  const resetSelection = (): void => onSelectionChange(0, timelineDurationSeconds)

  return (
    <>
      <section className="clip-export-group clip-editor-selection-group">
        <div className="clip-export-group-heading">
          <strong>{copy.clipExportDialog.selectionTitle}</strong>
          <span>{copy.clipExportDialog.selectionHint}</span>
        </div>
        <div className="clip-editor-timeline" aria-label={copy.clipExportDialog.selectionTitle}>
          <div className="clip-editor-timeline-track" aria-hidden="true">
            <div className="clip-editor-timeline-selection" style={{ left: `${startPercent}%`, width: `${selectionWidthPercent}%` }} />
          </div>
          <input
            className="clip-editor-range clip-editor-range-start"
            type="range"
            min={0}
            max={timelineDurationSeconds}
            step={0.1}
            value={selection.startSeconds}
            disabled={!canExport}
            aria-label={copy.clipExportDialog.startLabel}
            onChange={(event) => onSelectionChange(Number(event.currentTarget.value), selection.endSeconds)}
          />
          <input
            className="clip-editor-range clip-editor-range-end"
            type="range"
            min={0}
            max={timelineDurationSeconds}
            step={0.1}
            value={selection.endSeconds}
            disabled={!canExport}
            aria-label={copy.clipExportDialog.endLabel}
            onChange={(event) => onSelectionChange(selection.startSeconds, Number(event.currentTarget.value))}
          />
        </div>
        <div className="clip-editor-timeline-labels">
          <span>00:00</span>
          <strong>{formatClipTime(timelineDurationSeconds)}</strong>
        </div>
        <div className="clip-editor-time-grid">
          <label className="clip-editor-time-field">
            <span>{copy.clipExportDialog.startLabel}</span>
            <input type="number" min={0} max={timelineDurationSeconds} step={0.1} value={roundClipTime(selection.startSeconds)} disabled={!canExport} onChange={(event) => onSelectionChange(Number(event.currentTarget.value), selection.endSeconds)} />
          </label>
          <label className="clip-editor-time-field">
            <span>{copy.clipExportDialog.endLabel}</span>
            <input type="number" min={0} max={timelineDurationSeconds} step={0.1} value={roundClipTime(selection.endSeconds)} disabled={!canExport} onChange={(event) => onSelectionChange(selection.startSeconds, Number(event.currentTarget.value))} />
          </label>
          <div className="clip-editor-duration-card">
            <span>{copy.clipExportDialog.durationLabel}</span>
            <strong>{formatClipTime(selectedDurationSeconds)}</strong>
          </div>
        </div>
        <div className="clip-editor-selection-actions">
          <button className="settings-secondary-button" type="button" onClick={setStartFromCurrentTime} disabled={!canExport}>{copy.clipExportDialog.setStart}</button>
          <button className="settings-secondary-button" type="button" onClick={setEndFromCurrentTime} disabled={!canExport}>{copy.clipExportDialog.setEnd}</button>
          <button className="settings-secondary-button" type="button" onClick={resetSelection} disabled={!canExport}><RotateCcw size={13} />{copy.clipExportDialog.resetSelection}</button>
        </div>
      </section>

      <section className="clip-export-group">
        <div className="clip-export-group-heading">
          <strong>{copy.clipExportDialog.lengthTitle}</strong>
        </div>
        <div className="clip-export-length-grid">
          {clipExportLengthOptions.map((lengthSeconds) => {
            const isSelected = Math.abs(selectedDurationSeconds - lengthSeconds) < MIN_CLIP_DURATION_SECONDS / 2
            return <button key={lengthSeconds} className={`clip-export-length-option ${isSelected ? 'is-selected' : ''}`} type="button" onClick={() => onSelectionChange(selection.startSeconds, selection.startSeconds + lengthSeconds)} aria-pressed={isSelected} disabled={!canExport}>{copy.clipExportDialog.lengthOptions[lengthSeconds]}</button>
          })}
        </div>
      </section>
    </>
  )
}
