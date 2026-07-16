import { isSubtitleLanguageMatch } from './app-helpers'
import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { SubtitleTargetLanguageId } from '../../../shared/app-settings'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import type { SubtitleSummaryActions, SubtitleSummarySource } from './use-subtitle-summary'
import type { SubtitleTranslationActions } from './use-subtitle-translation'
import { AiWorkflowFailureError, type AiWorkflowMode, hasUsableTranslation } from './ai-workflow-types'

export type AiWorkflowRunnerContext = {
  model: AppModel
  derived: AppDerived
  mode: AiWorkflowMode
  filePath: string
  targetLanguage: SubtitleTargetLanguageId
  generateSubtitle: () => Promise<AsrSubtitleResult | null>
  translation: SubtitleTranslationActions
  summary: SubtitleSummaryActions
  updateWorkflow: (patch: { stage?: 'preparing' | 'asr' | 'translation' | 'summary'; progress?: number | null; message?: string }) => void
  assertWorkflowCanContinue: (filePath: string) => void
}

export async function runAiWorkflow(context: AiWorkflowRunnerContext): Promise<void> {
  const { model, derived, mode, filePath, targetLanguage, generateSubtitle, translation, summary, updateWorkflow, assertWorkflowCanContinue } = context
  const workflowCopy = derived.copy.asrPanel
  let generatedSubtitle: AsrSubtitleResult | null = null
  let source: SubtitleSummarySource | null = null

  assertWorkflowCanContinue(filePath)

  if (mode === 'guide' && derived.summarySourcePath) {
    source = { subtitlePath: derived.summarySourcePath, sourceLanguage: derived.summarySourceLanguage, sourceType: derived.summarySourceType }
  } else {
    updateWorkflow({ stage: 'asr', progress: 0, message: workflowCopy.workflowAsr })
    generatedSubtitle = derived.subtitlePath ? null : await generateSubtitle()
    assertWorkflowCanContinue(filePath)

    const rawSubtitlePath = generatedSubtitle?.subtitlePath ?? derived.subtitlePath
    if (!rawSubtitlePath) throw new AiWorkflowFailureError(derived.copy.summary.openSubtitleTools)
    source = {
      subtitlePath: rawSubtitlePath,
      sourceLanguage: generatedSubtitle?.subtitleLanguage ?? derived.subtitleTranslationSourceLanguage,
      sourceType: 'raw'
    }
  }

  if (mode === 'complete' && source) {
    if (isSubtitleLanguageMatch(source.sourceLanguage, targetLanguage)) {
      updateWorkflow({ stage: 'translation', progress: 1, message: workflowCopy.workflowTranslationSkipped })
    } else if (hasUsableTranslation(model.translatedSubtitleResult, source.subtitlePath, targetLanguage)) {
      source = { subtitlePath: model.translatedSubtitleResult.subtitlePath, sourceLanguage: targetLanguage, sourceType: 'translated' }
      updateWorkflow({ stage: 'translation', progress: 1, message: workflowCopy.workflowTranslationSkipped })
    } else {
      updateWorkflow({ stage: 'translation', progress: 0, message: workflowCopy.workflowTranslation })
      const translated = await translation.translateSubtitle(targetLanguage, generatedSubtitle)
      assertWorkflowCanContinue(filePath)
      if (!translated?.success || !translated.subtitlePath) {
        throw new AiWorkflowFailureError(translated?.message ?? workflowCopy.workflowTranslation)
      }
      source = { subtitlePath: translated.subtitlePath, sourceLanguage: targetLanguage, sourceType: 'translated' }
    }
  }

  if (!source) throw new AiWorkflowFailureError(derived.copy.summary.openSubtitleTools)
  updateWorkflow({ stage: 'summary', progress: 0, message: workflowCopy.workflowSummary })
  const result = await summary.summarizeSubtitle({ source, openPanel: false })
  assertWorkflowCanContinue(filePath)
  if (!result?.success) throw new AiWorkflowFailureError(result?.message ?? derived.copy.summary.failedTitle)
}
