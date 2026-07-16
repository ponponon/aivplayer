import { BookOpen, Clock, FileText, Languages, Sparkles, X } from 'lucide-react'
import type { ReactElement, ReactNode } from 'react'
import { useAppContext } from './app-context'
import { SummaryChapters } from './summary-chapters'
import { SummaryExportActions } from './summary-export-actions'
import { SummaryModeSelector } from './summary-mode-selector'

export function SummaryPanel(): ReactElement {
  const app = useAppContext()
  const result = app.subtitleSummaryResult
  const summary = (result?.mode ?? 'detailed') === app.summaryMode ? result?.summary : undefined
  const hasFailure = (app.summaryNotice && !app.summaryNotice.success) || app.aiWorkflowState.status === 'failed'

  return <>
    <div className="panel-header summary-panel-heading">
      <div><span className="panel-kicker">{app.copy.panels.summaryKicker}</span><h2>{app.copy.panels.summaryTitle}</h2></div>
      <BookOpen size={19} />
    </div>
    <div className="summary-panel-content">
      {!app.state.currentFile ? <div className="panel-empty">{app.copy.summary.noMedia}</div> : null}
      {app.state.currentFile && (app.isSummarizingSubtitle || app.aiWorkflowState.status === 'running') ? <SummaryLoading /> : null}
      {app.state.currentFile && app.aiWorkflowState.status !== 'running' && !app.isSummarizingSubtitle && !summary ? <SummaryEmpty hasFailure={Boolean(hasFailure)} /> : null}
      {summary ? <SummaryArticle /> : null}
    </div>
  </>
}

function SummaryLoading(): ReactElement {
  const app = useAppContext()
  const progress = app.asrProgress?.percent ?? app.aiWorkflowState.progress ?? 0
  return <section className="summary-empty-state summary-loading" aria-live="polite">
    <div className="summary-loading-mark"><Sparkles size={18} /></div>
    <strong>{app.copy.summary.generating}</strong>
    <p>{app.asrProgress?.message || app.aiWorkflowState.message || app.copy.asrPanel.summarizingSubtitle}</p>
    <div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round(progress * 100)}%` }} /></div>
    <button className="asr-action-button" type="button" onClick={() => void (app.aiWorkflowState.status === 'running' ? app.cancelAiWorkflow() : app.cancelSummary())}><X size={15} />{app.aiWorkflowState.status === 'running' ? app.copy.asrPanel.workflowCancel : app.copy.asrPanel.cancelSummary}</button>
  </section>
}

function SummaryEmpty({ hasFailure }: { hasFailure: boolean }): ReactElement {
  const app = useAppContext()
  return <section className="summary-empty-state">
    <div className="summary-empty-mark"><FileText size={20} /></div>
    <strong>{hasFailure ? app.copy.summary.failedTitle : app.copy.summary.emptyTitle}</strong>
    <p>{hasFailure ? app.summaryNotice?.message ?? app.aiWorkflowState.errorMessage : app.copy.summary.emptyDescription}</p>
    <div className="summary-empty-hint">{app.copy.summary.languageHint(app.subtitleTargetLanguageLabel)}</div>
    <SummaryModeSelector />
    <button className="asr-action-button primary" type="button" onClick={() => void app.startAiWorkflow('guide')} disabled={!app.canGenerateSummary}><Sparkles size={15} />{app.copy.asrPanel.workflowGuide}</button>
    <button className="asr-action-button" type="button" onClick={() => void app.startAiWorkflow('complete')} disabled={!app.canGenerateSummary}>{app.copy.asrPanel.workflowComplete}</button>
    {!app.subtitlePath && !app.asrStatus?.available ? <button className="summary-link-button" type="button" onClick={() => app.openPanelMode('asr')}>{app.copy.summary.openSubtitleTools}</button> : null}
  </section>
}

function SummaryArticle(): ReactElement | null {
  const app = useAppContext()
  const result = app.subtitleSummaryResult
  const summary = (result?.mode ?? 'detailed') === app.summaryMode ? result?.summary : undefined
  if (!summary) return null
  const stats = app.subtitleSummaryResult?.summaryStats
  const isQuickMode = app.summaryMode === 'quick'
  const sourceType = result?.sourceType ?? 'raw'
  const translatedSubtitle = app.translatedSubtitleResult
  const canRegenerateFromTranslation = sourceType === 'raw' && Boolean(translatedSubtitle?.subtitlePath && translatedSubtitle.sourceSubtitlePath === app.subtitlePath && translatedSubtitle.targetLanguage === app.appSettings.subtitles.targetLanguage)
  return <article className="summary-article">
    <SummaryModeSelector />
    <div className="summary-article-topline"><span className={`summary-spoiler-badge ${isQuickMode ? 'is-safe' : ''}`}>{isQuickMode ? app.copy.summary.noSpoilerBadge : app.copy.summary.spoilerBadge}</span><span className="summary-source-badge">{sourceType === 'translated' ? app.copy.summary.sourceTranslated : app.copy.summary.sourceRaw}</span><span>{app.copy.summary.languageLabel(app.subtitleTargetLanguageLabel)}</span></div>
    <h3>{summary.title}</h3>
    <p className="summary-overview">{summary.overview}</p>
    <SummarySection title={app.copy.summary.synopsisTitle}><div className="summary-prose">{summary.synopsis || app.copy.summary.notEnoughContent}</div></SummarySection>
    {summary.chapters.length > 0 ? <SummaryChapters chapters={summary.chapters} title={app.copy.summary.chaptersTitle} /> : null}
    {summary.keyPoints.length > 0 ? <SummarySection title={app.copy.summary.keyPointsTitle}><ul className="summary-list">{summary.keyPoints.map((point) => <li key={point}>{point}</li>)}</ul></SummarySection> : null}
    {summary.characters.length > 0 ? <SummarySection title={app.copy.summary.charactersTitle}><div className="summary-character-list">{summary.characters.map((character) => <div className="summary-character" key={`${character.name}-${character.role}`}><strong>{character.name}</strong><span>{character.role || app.copy.summary.characterFallback}</span></div>)}</div></SummarySection> : null}
    {summary.themes.length > 0 ? <SummarySection title={app.copy.summary.themesTitle}><div className="summary-theme-list">{summary.themes.map((theme) => <span key={theme}>{theme}</span>)}</div></SummarySection> : null}
    {!isQuickMode ? <SummarySection title={app.copy.summary.endingTitle}><div className="summary-prose">{summary.ending || app.copy.summary.notEnoughContent}</div></SummarySection> : null}
    {stats ? <div className="summary-meta"><Clock size={13} /><span>{app.copy.summary.generatedMeta(app.formatElapsedTime(stats.elapsedMs), stats.cacheHit)}</span><span>{app.copy.summary.sourceMeta(stats.subtitleCueCount)}</span></div> : null}
    <SummaryExportActions />
    {canRegenerateFromTranslation ? <button className="summary-regenerate-button summary-source-action" type="button" onClick={() => void app.summarizeSubtitle({ source: { subtitlePath: translatedSubtitle?.subtitlePath ?? '', sourceLanguage: app.appSettings.subtitles.targetLanguage, sourceType: 'translated' } })} disabled={!app.canGenerateSummary}><Languages size={14} />{app.copy.summary.regenerateFromTranslation}</button> : null}
    <button className="summary-regenerate-button" type="button" onClick={() => void app.summarizeSubtitle()} disabled={!app.canGenerateSummary}><Sparkles size={14} />{app.copy.summary.regenerate}</button>
  </article>
}

function SummarySection({ title, children }: { title: string; children: ReactNode }): ReactElement {
  return <section className="summary-section"><h4>{title}</h4>{children}</section>
}
