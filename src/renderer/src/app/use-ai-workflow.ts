import { useEffect, useRef, useState } from 'react'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import type { SubtitleSummaryActions } from './use-subtitle-summary'
import type { SubtitleTranslationActions } from './use-subtitle-translation'
import { runAiWorkflow } from './ai-workflow-runner'
import {
  AiWorkflowCancelledError,
  createIdleWorkflowState,
  type AiWorkflowActions,
  type AiWorkflowMode,
  type AiWorkflowState
} from './ai-workflow-types'

export type { AiWorkflowActions, AiWorkflowMode, AiWorkflowState } from './ai-workflow-types'

export function useAiWorkflow(
  model: AppModel,
  derived: AppDerived,
  generateSubtitle: Parameters<typeof runAiWorkflow>[0]['generateSubtitle'],
  cancelSubtitle: () => Promise<void>,
  translation: SubtitleTranslationActions,
  summary: SubtitleSummaryActions,
  openPanelMode: (panel: 'summary') => void
): AiWorkflowActions {
  const [aiWorkflowState, setAiWorkflowState] = useState<AiWorkflowState>(() => createIdleWorkflowState(null))
  const [isAiAutomationPromptVisible, setIsAiAutomationPromptVisible] = useState(false)
  const runRef = useRef<Promise<void> | null>(null)
  const cancelRequestedRef = useRef(false)
  const promptedFileRef = useRef<string | null>(null)
  const autoRunFileRef = useRef<string | null>(null)
  const currentFilePathRef = useRef<string | null>(null)
  const currentStageRef = useRef<AiWorkflowState['stage']>('idle')
  currentFilePathRef.current = model.state.currentFile?.path ?? null

  const updateWorkflow = (patch: Partial<AiWorkflowState>): void => {
    if (patch.stage) currentStageRef.current = patch.stage
    setAiWorkflowState((current) => ({ ...current, ...patch }))
  }

  const assertWorkflowCanContinue = (filePath: string): void => {
    if (cancelRequestedRef.current || currentFilePathRef.current !== filePath) throw new AiWorkflowCancelledError()
  }

  const startAiWorkflow = (mode: AiWorkflowMode, options: { automatic?: boolean } = {}): Promise<void> => {
    if (runRef.current) return runRef.current
    const filePath = currentFilePathRef.current
    if (!filePath) return Promise.resolve()

    const automatic = options.automatic === true
    cancelRequestedRef.current = false
    setIsAiAutomationPromptVisible(false)
    if (!automatic) openPanelMode('summary')

    const task = (async (): Promise<void> => {
      const targetLanguage = model.appSettings.subtitles.targetLanguage
      const workflowCopy = derived.copy.asrPanel
      currentStageRef.current = 'preparing'
      setAiWorkflowState({ status: 'running', mode, stage: 'preparing', filePath, automatic, progress: 0, message: workflowCopy.workflowPreparing, errorMessage: null })
      try {
        await runAiWorkflow({ model, derived, mode, filePath, targetLanguage, generateSubtitle, translation, summary, updateWorkflow, assertWorkflowCanContinue })
        setAiWorkflowState({ status: 'completed', mode, stage: 'summary', filePath, automatic, progress: 1, message: workflowCopy.workflowCompleted, errorMessage: null })
      } catch (error) {
        if (currentFilePathRef.current !== filePath) return
        if (error instanceof AiWorkflowCancelledError) {
          setAiWorkflowState({ status: 'cancelled', mode, stage: currentStageRef.current, filePath, automatic, progress: null, message: workflowCopy.workflowCancelled, errorMessage: null })
          return
        }
        const message = error instanceof Error ? error.message : String(error)
        setAiWorkflowState({ status: 'failed', mode, stage: currentStageRef.current, filePath, automatic, progress: null, message, errorMessage: message })
      }
    })()

    runRef.current = task
    const finish = (): void => {
      if (runRef.current === task) runRef.current = null
      if (currentFilePathRef.current !== filePath) setAiWorkflowState(createIdleWorkflowState(currentFilePathRef.current))
    }
    void task.then(finish, finish)
    return task
  }

  const cancelAiWorkflow = async (): Promise<void> => {
    if (!runRef.current) return
    cancelRequestedRef.current = true
    if (model.isAsrBusy) await cancelSubtitle()
    if (model.isSummarizingSubtitle) await summary.cancelSummary()
    if (model.isTranslatingSubtitle) await translation.cancelTranslation()
  }

  const retryAiWorkflow = async (): Promise<void> => {
    if (aiWorkflowState.mode) await startAiWorkflow(aiWorkflowState.mode, { automatic: aiWorkflowState.automatic })
  }

  const acceptAiAutomation = async (mode: AiWorkflowMode): Promise<void> => {
    await startAiWorkflow(mode, { automatic: true })
  }

  const dismissAiAutomationPrompt = (): void => {
    const filePath = currentFilePathRef.current
    if (filePath) promptedFileRef.current = filePath
    setIsAiAutomationPromptVisible(false)
  }

  useEffect(() => {
    const filePath = model.state.currentFile?.path ?? null
    if (filePath !== aiWorkflowState.filePath && !runRef.current) setAiWorkflowState(createIdleWorkflowState(filePath))
    if (!filePath) {
      setIsAiAutomationPromptVisible(false)
      return
    }

    const openMode = model.appSettings.ai.openMode
    if (openMode === 'ask') {
      if (model.subtitleSummaryResult?.summary) {
        promptedFileRef.current = filePath
        setIsAiAutomationPromptVisible(false)
        return
      }
      if (promptedFileRef.current !== filePath) {
        promptedFileRef.current = filePath
        setIsAiAutomationPromptVisible(true)
      }
      return
    }
    const hasSubtitleSource = Boolean(derived.summarySourcePath || derived.subtitlePath || model.asrStatus?.available)
    if ((openMode === 'guide' || openMode === 'complete') && hasSubtitleSource && autoRunFileRef.current !== filePath) {
      autoRunFileRef.current = filePath
      void startAiWorkflow(openMode, { automatic: true })
    }
  }, [model.state.currentFile?.path, model.appSettings.ai.openMode, model.asrStatus?.available, model.subtitleSummaryResult?.summary, derived.summarySourcePath, derived.subtitlePath, aiWorkflowState.status, aiWorkflowState.filePath])

  return { aiWorkflowState, isAiAutomationPromptVisible, startAiWorkflow, cancelAiWorkflow, retryAiWorkflow, acceptAiAutomation, dismissAiAutomationPrompt }
}
