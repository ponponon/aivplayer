import type { AsrSubtitleTranslationResult } from '../../../shared/media-types'

export type AiWorkflowMode = 'guide' | 'complete'
export type AiWorkflowStage = 'idle' | 'preparing' | 'asr' | 'translation' | 'summary'
export type AiWorkflowStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled'

export type AiWorkflowState = {
  status: AiWorkflowStatus
  mode: AiWorkflowMode | null
  stage: AiWorkflowStage
  filePath: string | null
  automatic: boolean
  progress: number | null
  message: string
  errorMessage: string | null
}

export type AiWorkflowActions = {
  aiWorkflowState: AiWorkflowState
  isAiAutomationPromptVisible: boolean
  startAiWorkflow: (mode: AiWorkflowMode, options?: { automatic?: boolean }) => Promise<void>
  cancelAiWorkflow: () => Promise<void>
  retryAiWorkflow: () => Promise<void>
  acceptAiAutomation: (mode: AiWorkflowMode) => Promise<void>
  dismissAiAutomationPrompt: () => void
}

export class AiWorkflowCancelledError extends Error {
  constructor() {
    super('AI workflow cancelled')
    this.name = 'AiWorkflowCancelledError'
  }
}

export class AiWorkflowFailureError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiWorkflowFailureError'
  }
}

export function createIdleWorkflowState(filePath: string | null): AiWorkflowState {
  return {
    status: 'idle',
    mode: null,
    stage: 'idle',
    filePath,
    automatic: false,
    progress: null,
    message: '',
    errorMessage: null
  }
}

export function hasUsableTranslation(
  result: AsrSubtitleTranslationResult | null,
  sourcePath: string,
  targetLanguage: string
): result is AsrSubtitleTranslationResult & { subtitlePath: string } {
  return Boolean(
    result?.success &&
      result.subtitlePath &&
      result.targetLanguage === targetLanguage &&
      result.sourceSubtitlePath === sourcePath
  )
}
