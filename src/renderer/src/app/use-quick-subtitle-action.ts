import type { AppSettings, SubtitleTargetLanguageId } from '../../../shared/app-settings'
import type { AsrSubtitleResult } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import type { SubtitleTranslationActions } from './use-subtitle-translation'
import { isSubtitleLanguageMatch } from './app-helpers'

export function useQuickSubtitleAction(model: AppModel, derived: AppDerived, openPanelMode: (panel: 'asr') => void, patchDisplay: (patch: Partial<AppSettings['subtitles']>) => void, generateSubtitle: () => Promise<AsrSubtitleResult | null>, translateSubtitle: SubtitleTranslationActions['translateSubtitle']) {
  const changeSubtitleTargetLanguage = (targetLanguage: SubtitleTargetLanguageId): void => {
    if (model.isAsrBusy || model.isTranslatingSubtitle) return
    model.setAsrNotice(null)
    model.setTranslatedSubtitleResult(null)
    if (targetLanguage !== model.appSettings.subtitles.targetLanguage) patchDisplay({ targetLanguage })
    if (isSubtitleLanguageMatch(derived.subtitleSourceLanguage, targetLanguage)) patchDisplay({ displayMode: 'source', targetLanguage })
    else void translateSubtitle(targetLanguage)
  }
  const runQuickTargetSubtitle = async (): Promise<void> => {
    if (!model.state.currentFile || model.isAsrBusy || model.isTranslatingSubtitle || model.isDownloadingModel) return
    if (!model.asrStatus?.available) { openPanelMode('asr'); return }
    if (derived.isTargetSourceSubtitle) { patchDisplay({ displayMode: 'source', targetLanguage: derived.quickTargetLanguage }); return }
    if (derived.isTargetTranslationReady) { patchDisplay({ displayMode: 'translation', targetLanguage: derived.quickTargetLanguage }); return }
    model.setAsrNotice(null)
    model.setTranslatedSubtitleResult(null)
    const startedAt = performance.now()
    if (derived.subtitlePath) { await translateSubtitle(derived.quickTargetLanguage, null, startedAt); return }
    const generated = await generateSubtitle()
    if (!generated?.subtitlePath) return
    if (isSubtitleLanguageMatch(generated.subtitleLanguage, derived.quickTargetLanguage)) patchDisplay({ displayMode: 'source', targetLanguage: derived.quickTargetLanguage })
    else await translateSubtitle(derived.quickTargetLanguage, generated, startedAt)
  }
  return { changeSubtitleTargetLanguage, runQuickTargetSubtitle }
}
