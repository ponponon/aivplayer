import type { AsrSubtitleResult, AsrSubtitleSummaryMode, AsrSubtitleSummaryResult, AsrSubtitleSummarySourceType } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export type SubtitleSummaryActions = {
  summarizeSubtitle: (options?: SubtitleSummaryOptions) => Promise<AsrSubtitleSummaryResult | null>
  cancelSummary: () => Promise<void>
}

export type SubtitleSummarySource = {
  subtitlePath: string
  sourceLanguage?: string | null
  sourceType?: AsrSubtitleSummarySourceType
}

export type SubtitleSummaryOptions = {
  source?: SubtitleSummarySource
  mode?: AsrSubtitleSummaryMode
  openPanel?: boolean
}

export function useSubtitleSummary(
  model: AppModel,
  derived: AppDerived,
  generateSubtitle: () => Promise<AsrSubtitleResult | null>,
  openPanelMode: (panel: 'summary') => void
): SubtitleSummaryActions {
  const summarizeSubtitle = async (options: SubtitleSummaryOptions = {}): Promise<AsrSubtitleSummaryResult | null> => {
    if (model.isSummarizingSubtitle || model.isTranslatingSubtitle || model.isDownloadingModel || !model.state.currentFile) return null
    if (options.openPanel !== false) openPanelMode('summary')
    let sourcePath = options.source?.subtitlePath ?? derived.summarySourcePath
    let sourceLanguage = options.source?.sourceLanguage ?? derived.summarySourceLanguage
    let sourceType = options.source?.sourceType ?? derived.summarySourceType

    if (!sourcePath) {
      const generated = await generateSubtitle()
      if (!generated?.subtitlePath) return null
      sourcePath = generated.subtitlePath
      sourceLanguage = generated.subtitleLanguage ?? 'auto'
      sourceType = 'raw'
    }

    model.summaryStartedAtRef.current = performance.now()
    model.setSummaryElapsedMs(0)
    model.setIsSummarizingSubtitle(true)
    model.setSubtitleSummaryResult(null)
    model.setSummaryNotice(null)
    model.setAsrProgress({ stage: 'summarizing', percent: 0, message: derived.copy.asrPanel.summarizingSubtitle })
    try {
      const summaryMode = options.mode ?? model.summaryMode
      const force = Boolean(model.subtitleSummaryResult?.summary && (model.subtitleSummaryResult.mode ?? 'detailed') === summaryMode)
      const result = await window.aiv.summarizeAsrSubtitle({ mediaPath: model.state.currentFile.path, subtitlePath: sourcePath, sourceLanguage: sourceLanguage ?? undefined, sourceType, targetLanguage: model.appSettings.subtitles.targetLanguage, mode: summaryMode, force })
      model.setSummaryElapsedMs(result.summaryStats?.elapsedMs ?? (model.summaryStartedAtRef.current ? Math.max(0, Math.round(performance.now() - model.summaryStartedAtRef.current)) : 0))
      model.setSubtitleSummaryResult(result.success ? result : null)
      model.setSummaryNotice(result)
      return result
    } finally {
      model.setIsSummarizingSubtitle(false)
      model.setAsrProgress(null)
      model.summaryStartedAtRef.current = null
    }
  }

  const cancelSummary = async (): Promise<void> => {
    if (model.isSummarizingSubtitle) await window.aiv.cancelAsrSummary()
  }

  return { summarizeSubtitle, cancelSummary }
}
