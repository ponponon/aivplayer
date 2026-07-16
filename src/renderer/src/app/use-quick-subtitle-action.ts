import type { AppSettings, SubtitleTargetLanguageId } from '../../../shared/app-settings'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import type { SubtitleTranslationActions } from './use-subtitle-translation'
import type { AiWorkflowActions } from './use-ai-workflow'
import { isSubtitleLanguageMatch } from './app-helpers'

export function useQuickSubtitleAction(
  model: AppModel,
  derived: AppDerived,
  openPanelMode: (panel: 'asr' | 'summary') => void,
  patchDisplay: (patch: Partial<AppSettings['subtitles']>) => void,
  translateSubtitle: SubtitleTranslationActions['translateSubtitle'],
  startAiWorkflow: AiWorkflowActions['startAiWorkflow']
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
    if (!derived.subtitlePath && !model.asrStatus?.available) { openPanelMode('asr'); return }
    await startAiWorkflow('complete')
  }

  return { changeSubtitleTargetLanguage, runQuickComplete }
}
