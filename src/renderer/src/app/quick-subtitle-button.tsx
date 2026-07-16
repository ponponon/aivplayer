import { Check, Sparkles } from 'lucide-react'
import { useAppContext } from './app-context'

export function QuickSubtitleButton(): React.ReactElement {
  const app = useAppContext()
  const isWorkflowRunning = app.aiWorkflowState.status === 'running' && app.aiWorkflowState.filePath === app.state.currentFile?.path
  const isWorkflowCompleted = app.aiWorkflowState.status === 'completed' && app.aiWorkflowState.filePath === app.state.currentFile?.path
  const isBusy = app.isAsrBusy || app.isTranslatingSubtitle || app.isSummarizingSubtitle || app.isDownloadingModel || isWorkflowRunning
  const hint = isWorkflowRunning
    ? app.asrProgress?.message ?? app.aiWorkflowState.message
    : isWorkflowCompleted
      ? app.copy.asrPanel.workflowOpenSummary
      : app.copy.quickSubtitle.hint
  const label = isWorkflowRunning
    ? app.copy.asrPanel.workflowRunning
    : isWorkflowCompleted
      ? app.copy.asrPanel.workflowCompleted
      : app.copy.asrPanel.workflowComplete

  return <button className={`quick-subtitle-button ${isWorkflowCompleted ? 'is-ready' : ''}`} type="button" onClick={() => void app.runQuickComplete()} disabled={!app.hasCurrentFile || isBusy || isWorkflowCompleted} title={app.copy.quickSubtitle.shortcut} aria-keyshortcuts="Meta+Shift+C Control+Shift+C" aria-label={app.copy.quickSubtitle.hint}><span className="quick-subtitle-icon" aria-hidden="true">{isWorkflowRunning ? <Sparkles size={16} /> : isWorkflowCompleted ? <Check size={16} /> : <Sparkles size={16} />}</span><span className="quick-subtitle-copy"><strong>{label}</strong><small>{hint}</small></span></button>
}
