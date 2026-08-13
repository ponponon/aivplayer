import { Check, Sparkles } from 'lucide-react'
import { useAppContext } from './app-context'

export function QuickSubtitleButton(): React.ReactElement {
  const app = useAppContext()
  const isWorkflowRunning = app.aiWorkflowState.status === 'running' && app.aiWorkflowState.filePath === app.state.currentFile?.path
  const isWorkflowCompleted = app.aiWorkflowState.status === 'completed' && app.aiWorkflowState.filePath === app.state.currentFile?.path
  const isBusy = app.isAsrBusy || app.isTranslatingSubtitle || app.isSummarizingSubtitle || app.isDownloadingModel || isWorkflowRunning
  const accessibleLabel = isWorkflowRunning
    ? app.asrProgress?.message ?? app.aiWorkflowState.message
    : isWorkflowCompleted
      ? app.copy.asrPanel.workflowOpenSummary
      : `${app.copy.asrPanel.workflowComplete} · ${app.copy.quickSubtitle.hint}`

  return <button className={`quick-subtitle-button ${isWorkflowCompleted ? 'is-ready' : ''}`} type="button" onClick={() => void app.runQuickComplete()} disabled={!app.hasCurrentFile || isBusy || isWorkflowCompleted} title={`${accessibleLabel} · ${app.copy.quickSubtitle.shortcut}`} aria-keyshortcuts="Meta+Shift+C Control+Shift+C" aria-label={accessibleLabel}><span className="quick-subtitle-icon" aria-hidden="true">{isWorkflowRunning ? <Sparkles size={16} /> : isWorkflowCompleted ? <Check size={16} /> : <Sparkles size={16} />}</span></button>
}
