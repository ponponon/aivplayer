import type { AsrSubtitleSummaryMode, AsrSubtitleSummaryResult, AsrSubtitleSummarySourceType } from '../../../shared/media-types'

export type SummaryCacheUpgradeContext = {
  preferredSourceType: AsrSubtitleSummarySourceType
  rawSourcePath: string | null
  rawSourceRevision?: number
  targetLanguage: AsrSubtitleSummaryResult['targetLanguage']
  summaryModel: string | undefined
  mode: AsrSubtitleSummaryMode
}

/**
 * Keep a raw summary visible while a preferred translated cache is being
 * discovered. The translated source is an enhancement, not a reason to blank
 * an already usable result while its asynchronous lookup is in flight.
 */
export function canKeepRawSummaryWhileTranslatedSourceLoads(
  current: AsrSubtitleSummaryResult | null,
  context: SummaryCacheUpgradeContext
): boolean {
  if (!current?.summary || context.preferredSourceType !== 'translated' || (current.sourceType ?? 'raw') !== 'raw') return false
  if (current.targetLanguage !== context.targetLanguage || current.summaryModel !== context.summaryModel || (current.mode ?? 'detailed') !== context.mode) return false
  if (!current.sourceSubtitlePath || current.sourceSubtitlePath !== context.rawSourcePath) return false
  return context.rawSourceRevision === undefined || current.sourceSubtitleRevision === context.rawSourceRevision
}
