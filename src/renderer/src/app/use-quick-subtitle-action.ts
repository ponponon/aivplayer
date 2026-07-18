import type { AppSettings, SubtitleTargetLanguageId } from '../../../shared/app-settings'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import type { SubtitleTranslationActions } from './use-subtitle-translation'
import type { AiWorkflowActions } from './use-ai-workflow'
import type { AiSetupActions, AiSetupIntent, AiSetupResumeAction } from './use-ai-setup'
import { isSubtitleLanguageMatch } from './app-helpers'

export function useQuickSubtitleAction(
  model: AppModel,
  derived: AppDerived,
  patchDisplay: (patch: Partial<AppSettings['subtitles']>) => void,
  translateSubtitle: SubtitleTranslationActions['translateSubtitle'],
  startAiWorkflow: AiWorkflowActions['startAiWorkflow'],
  isReadyForAiSetup: AiSetupActions['isReadyForAiSetup'],
  openAiSetup: (intent: AiSetupIntent, resumeAction: AiSetupResumeAction) => void
) {
  const isQuickActionBusy = (): boolean => Boolean(model.isAsrBusy || model.isTranslatingSubtitle || model.isSummarizingSubtitle || model.isDownloadingModel)

  const changeSubtitleTargetLanguage = (targetLanguage: SubtitleTargetLanguageId): void => {
    if (model.isAsrBusy || model.isTranslatingSubtitle) return
    model.setAsrNotice(null)
    model.setTranslatedSubtitleResult(null)
    if (targetLanguage !== model.appSettings.subtitles.targetLanguage) patchDisplay({ targetLanguage })
    if (isSubtitleLanguageMatch(derived.subtitleSourceLanguage, targetLanguage)) patchDisplay({ displayMode: 'source', targetLanguage })
    else void translateSubtitle(targetLanguage)
  }

  const runQuickComplete = async (): Promise<void> => {
    if (!model.state.currentFile || isQuickActionBusy()) return
    if (!isReadyForAiSetup('quick-complete')) {
      openAiSetup('quick-complete', () => startAiWorkflow('complete'))
      return
    }
    await startAiWorkflow('complete')
  }

  return { changeSubtitleTargetLanguage, runQuickComplete }
}
