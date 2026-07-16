import type { ReactElement } from 'react'
import type { AsrSubtitleSummaryMode } from '../../../shared/media-types'
import { useAppContext } from './app-context'

const modes: AsrSubtitleSummaryMode[] = ['quick', 'detailed']

export function SummaryModeSelector(): ReactElement {
  const app = useAppContext()
  const disabled = app.isSummarizingSubtitle || app.aiWorkflowState.status === 'running'
  const copy = app.copy.summary

  return <div className="summary-mode-selector">
    <span className="summary-mode-label">{copy.modeLabel}</span>
    <div className="summary-mode-options" role="group" aria-label={copy.modeLabel}>
      {modes.map((mode) => {
        const selected = app.summaryMode === mode
        const title = mode === 'quick' ? copy.modeQuickDescription : copy.modeDetailedDescription
        return <button
          key={mode}
          className={`summary-mode-option ${selected ? 'is-selected' : ''}`}
          type="button"
          disabled={disabled}
          aria-pressed={selected}
          title={title}
          onClick={() => app.setSummaryMode(mode)}
        >
          <strong>{mode === 'quick' ? copy.modeQuick : copy.modeDetailed}</strong>
          <small>{mode === 'quick' ? copy.modeQuickDescription : copy.modeDetailedDescription}</small>
        </button>
      })}
    </div>
  </div>
}
