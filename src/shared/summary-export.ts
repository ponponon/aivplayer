import type { SubtitleTargetLanguageId } from './app-settings'
import type { AsrSubtitleSummary, AsrSubtitleSummaryExportFormat, AsrSubtitleSummaryMode } from './asr-types'

export type SummaryExportLabels = {
  overviewTitle: string
  synopsisTitle: string
  chaptersTitle: string
  keyPointsTitle: string
  charactersTitle: string
  themesTitle: string
  endingTitle: string
  outputLanguageLabel: string
  modeLabel: string
  quickModeLabel: string
  detailedModeLabel: string
}

export type SummaryExportMeta = {
  targetLanguage: SubtitleTargetLanguageId
  targetLanguageLabel: string
  mode: AsrSubtitleSummaryMode
  labels: SummaryExportLabels
}

function formatTime(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(safeSeconds / 3600)
  const minutes = Math.floor((safeSeconds % 3600) / 60)
  const remainder = safeSeconds % 60
  return hours > 0
    ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

function modeLabel(meta: SummaryExportMeta): string {
  return meta.mode === 'quick' ? meta.labels.quickModeLabel : meta.labels.detailedModeLabel
}

function formatMarkdown(summary: AsrSubtitleSummary, meta: SummaryExportMeta): string {
  const sections = [`# ${summary.title}`, `> ${meta.labels.modeLabel}：${modeLabel(meta)} · ${meta.labels.outputLanguageLabel}：${meta.targetLanguageLabel}`, `## ${meta.labels.overviewTitle}\n${summary.overview || '—'}`, `## ${meta.labels.synopsisTitle}\n${summary.synopsis || '—'}`]
  if (summary.chapters.length > 0) sections.push(`## ${meta.labels.chaptersTitle}\n${summary.chapters.map((chapter) => `- **${formatTime(chapter.timeSeconds)} · ${chapter.title}**${chapter.summary ? `：${chapter.summary}` : ''}`).join('\n')}`)
  if (summary.keyPoints.length > 0) sections.push(`## ${meta.labels.keyPointsTitle}\n${summary.keyPoints.map((point) => `- ${point}`).join('\n')}`)
  if (summary.characters.length > 0) sections.push(`## ${meta.labels.charactersTitle}\n${summary.characters.map((character) => `- **${character.name}**${character.role ? `：${character.role}` : ''}`).join('\n')}`)
  if (summary.themes.length > 0) sections.push(`## ${meta.labels.themesTitle}\n${summary.themes.map((theme) => `- ${theme}`).join('\n')}`)
  if (meta.mode === 'detailed') sections.push(`## ${meta.labels.endingTitle}\n${summary.ending || '—'}`)
  return `${sections.join('\n\n')}\n`
}

function formatText(summary: AsrSubtitleSummary, meta: SummaryExportMeta): string {
  const sections = [summary.title, `${meta.labels.modeLabel}：${modeLabel(meta)} · ${meta.labels.outputLanguageLabel}：${meta.targetLanguageLabel}`, `${meta.labels.overviewTitle}\n${summary.overview || '—'}`, `${meta.labels.synopsisTitle}\n${summary.synopsis || '—'}`]
  if (summary.chapters.length > 0) sections.push(`${meta.labels.chaptersTitle}\n${summary.chapters.map((chapter) => `${formatTime(chapter.timeSeconds)} · ${chapter.title}${chapter.summary ? `：${chapter.summary}` : ''}`).join('\n')}`)
  if (summary.keyPoints.length > 0) sections.push(`${meta.labels.keyPointsTitle}\n${summary.keyPoints.map((point) => `• ${point}`).join('\n')}`)
  if (summary.characters.length > 0) sections.push(`${meta.labels.charactersTitle}\n${summary.characters.map((character) => `${character.name}${character.role ? `：${character.role}` : ''}`).join('\n')}`)
  if (summary.themes.length > 0) sections.push(`${meta.labels.themesTitle}\n${summary.themes.join('、')}`)
  if (meta.mode === 'detailed') sections.push(`${meta.labels.endingTitle}\n${summary.ending || '—'}`)
  return `${sections.join('\n\n')}\n`
}

function formatJson(summary: AsrSubtitleSummary, meta: SummaryExportMeta): string {
  return `${JSON.stringify({ formatVersion: 1, mode: meta.mode, targetLanguage: meta.targetLanguage, targetLanguageLabel: meta.targetLanguageLabel, summary }, null, 2)}\n`
}

export function formatSummaryExport(summary: AsrSubtitleSummary, format: AsrSubtitleSummaryExportFormat, meta: SummaryExportMeta): string {
  if (format === 'markdown') return formatMarkdown(summary, meta)
  if (format === 'json') return formatJson(summary, meta)
  return formatText(summary, meta)
}
