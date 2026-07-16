import { BookOpen, RotateCcw, Sparkles, X } from 'lucide-react'
import { useAppContext } from './app-context'

export function AiWorkflowStatus(): React.ReactElement | null {
  const app = useAppContext()
  const state = app.aiWorkflowState
  const currentFilePath = app.state.currentFile?.path ?? null
  const isCurrentFile = Boolean(currentFilePath && state.filePath === currentFilePath)

  if (!isCurrentFile) return null

  if (app.isAiAutomationPromptVisible) {
    return <section className="ai-workflow-bar ai-workflow-prompt" aria-label={app.copy.asrPanel.workflowAutoPromptTitle}>
      <div className="ai-workflow-bar-main"><span className="ai-workflow-icon"><Sparkles size={15} /></span><div><strong>{app.copy.asrPanel.workflowAutoPromptTitle}</strong><p>{app.copy.asrPanel.workflowAutoPromptDescription(app.subtitleTargetLanguageLabel)}</p></div></div>
      <div className="ai-workflow-actions"><button className="ai-workflow-button primary" type="button" onClick={() => void app.acceptAiAutomation('guide')}><Sparkles size={13} />{app.copy.asrPanel.workflowAutoGuide}</button><button className="ai-workflow-button" type="button" onClick={() => void app.acceptAiAutomation('complete')}>{app.copy.asrPanel.workflowAutoComplete}</button><button className="ai-workflow-button quiet" type="button" onClick={app.dismissAiAutomationPrompt}>{app.copy.asrPanel.workflowDismiss}</button></div>
    </section>
  }

  if (state.status === 'running') {
    const progress = app.asrProgress?.percent ?? state.progress
    return <section className="ai-workflow-bar" role="status" aria-live="polite">
      <div className="ai-workflow-bar-main"><span className="ai-workflow-icon spinning"><Sparkles size={15} /></span><div><strong>{app.copy.asrPanel.workflowRunning}</strong><p>{app.asrProgress?.message ?? state.message}</p></div></div>
      <div className="ai-workflow-bar-side">{progress != null ? <span className="ai-workflow-progress-label">{Math.round(progress * 100)}%</span> : null}<button className="ai-workflow-button quiet" type="button" onClick={() => void app.cancelAiWorkflow()}><X size={13} />{app.copy.asrPanel.workflowCancel}</button></div>
      {progress != null ? <div className="ai-workflow-progress"><span style={{ width: `${Math.round(progress * 100)}%` }} /></div> : null}
    </section>
  }

  if (state.status === 'failed') {
    return <section className="ai-workflow-bar ai-workflow-failed" role="alert"><div className="ai-workflow-bar-main"><span className="ai-workflow-icon"><Sparkles size={15} /></span><div><strong>{app.copy.summary.failedTitle}</strong><p>{state.errorMessage ?? state.message}</p></div></div><button className="ai-workflow-button" type="button" onClick={() => void app.retryAiWorkflow()}><RotateCcw size={13} />{app.copy.asrPanel.workflowRetry}</button></section>
  }

  if (state.status === 'cancelled') {
    return <section className="ai-workflow-bar ai-workflow-cancelled" role="status"><div className="ai-workflow-bar-main"><span className="ai-workflow-icon"><X size={15} /></span><strong>{app.copy.asrPanel.workflowCancelled}</strong></div><button className="ai-workflow-button" type="button" onClick={() => void app.retryAiWorkflow()}><RotateCcw size={13} />{app.copy.asrPanel.workflowRetry}</button></section>
  }

  if (state.status === 'completed' && state.automatic) {
    return <section className="ai-workflow-bar ai-workflow-completed" role="status"><div className="ai-workflow-bar-main"><span className="ai-workflow-icon"><BookOpen size={15} /></span><strong>{app.copy.asrPanel.workflowCompleted}</strong></div><button className="ai-workflow-button primary" type="button" onClick={() => app.openPanelMode('summary')}>{app.copy.asrPanel.workflowOpenSummary}</button></section>
  }

  return null
}
