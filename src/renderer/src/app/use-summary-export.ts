import { useEffect, useState } from 'react'
import type { AsrSubtitleSummary, AsrSubtitleSummaryExportFormat } from '../../../shared/media-types'
import { formatSummaryExport, type SummaryExportMeta } from '../../../shared/summary-export'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export type SummaryExportActions = {
  copySummary: () => Promise<void>
  exportSummary: (format: AsrSubtitleSummaryExportFormat) => Promise<void>
  isExportingSummary: boolean
  summaryExportMessage: string | null
}

export function useSummaryExport(model: AppModel, derived: AppDerived): SummaryExportActions {
  const [isExportingSummary, setIsExportingSummary] = useState(false)
  const [summaryExportMessage, setSummaryExportMessage] = useState<string | null>(null)

  useEffect(() => {
    setSummaryExportMessage(null)
  }, [model.state.currentFile?.path, model.subtitleSummaryResult?.sourceSubtitlePath, model.subtitleSummaryResult?.mode, model.summaryMode])

  const getCurrentSummary = (): AsrSubtitleSummary | null => {
    const result = model.subtitleSummaryResult
    return result?.summary && (result.mode ?? 'detailed') === model.summaryMode ? result.summary : null
  }

  const getMeta = (): SummaryExportMeta => ({
    targetLanguage: model.appSettings.subtitles.targetLanguage,
    targetLanguageLabel: derived.subtitleTargetLanguageLabel,
    mode: model.summaryMode,
    labels: {
      overviewTitle: derived.copy.summary.overviewTitle,
      synopsisTitle: derived.copy.summary.synopsisTitle,
      chaptersTitle: derived.copy.summary.chaptersTitle,
      keyPointsTitle: derived.copy.summary.keyPointsTitle,
      charactersTitle: derived.copy.summary.charactersTitle,
      themesTitle: derived.copy.summary.themesTitle,
      endingTitle: derived.copy.summary.endingTitle,
      outputLanguageLabel: derived.copy.summary.outputLanguageLabel,
      modeLabel: derived.copy.summary.modeLabel,
      quickModeLabel: derived.copy.summary.modeQuick,
      detailedModeLabel: derived.copy.summary.modeDetailed
    }
  })

  const getExportContent = (format: AsrSubtitleSummaryExportFormat): string | null => {
    const summary = getCurrentSummary()
    return summary ? formatSummaryExport(summary, format, getMeta()) : null
  }

  const copySummary = async (): Promise<void> => {
    const content = getExportContent('txt')
    if (!content) {
      setSummaryExportMessage(derived.copy.summary.noContentToExport)
      return
    }
    const result = await window.aiv.copyTextToClipboard({ text: content })
    setSummaryExportMessage(result.message)
  }

  const exportSummary = async (format: AsrSubtitleSummaryExportFormat): Promise<void> => {
    const content = getExportContent(format)
    if (!content) {
      setSummaryExportMessage(derived.copy.summary.noContentToExport)
      return
    }
    setIsExportingSummary(true)
    try {
      const result = await window.aiv.exportAsrSummary({ format, content, defaultFileName: model.state.currentFile?.name ?? getCurrentSummary()?.title })
      setSummaryExportMessage(result.message)
    } finally {
      setIsExportingSummary(false)
    }
  }

  return { copySummary, exportSummary, isExportingSummary, summaryExportMessage }
}
