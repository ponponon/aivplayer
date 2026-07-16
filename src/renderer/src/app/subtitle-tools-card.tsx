import { BookOpen, Captions, Languages, Sparkles, X } from 'lucide-react'
import { formatPercent } from './app-helpers'
import { SubtitleActionsMenu } from './subtitle-actions-menu'
import { SubtitleResultSummary } from './subtitle-result-summary'
import { AsrErrorDiagnostics } from './asr-error-diagnostics'
import { useAppContext } from './app-context'

export function SubtitleToolsCard(): React.ReactElement {
  const app = useAppContext()
  return <div className="asr-card open">
    <div className="asr-card-heading"><div className="asr-card-title"><Captions size={18} /><span>{app.copy.asrPanel.generateSubtitle}</span></div></div>
    <p>{app.copy.asrPanel.subtitlesReady}</p>
    <div className="subtitle-tools-row"><span className={`subtitle-status ${app.activeSubtitle?.subtitleUrl ? 'ready' : app.subtitlePath ? 'cached' : 'idle'}`}>{app.subtitleStatusLabel}</span>{app.translatedSubtitleReadyLabel ? <span className="subtitle-status ready">{app.translatedSubtitleReadyLabel}</span> : null}<SubtitleActionsMenu /></div>
    {app.subtitleLanguagePairLabel ? <div className="subtitle-language-row"><span>{app.copy.asrPanel.translationLanguagePair}</span><strong>{app.subtitleLanguagePairLabel}</strong></div> : null}
    <div className="subtitle-target-language-row"><span>{app.copy.asrPanel.translationTargetLanguage}</span><div className="subtitle-display-choice-group subtitle-target-language-group" role="group" aria-label={app.copy.asrPanel.translationTargetLanguage}>{app.subtitleTargetLanguageIds.map((targetLanguage) => <button key={targetLanguage} className={`subtitle-display-choice subtitle-target-language-choice ${app.appSettings.subtitles.targetLanguage === targetLanguage ? 'is-selected' : ''}`} type="button" onClick={() => app.changeSubtitleTargetLanguage(targetLanguage)} disabled={app.isAsrBusy || app.isTranslatingSubtitle} aria-pressed={app.appSettings.subtitles.targetLanguage === targetLanguage} title={app.copy.subtitleLanguageOptions[targetLanguage].description}>{app.copy.subtitleLanguageOptions[targetLanguage].label}</button>)}</div></div>
    {app.subtitleTranslationModelLabel ? <div className="subtitle-translation-row"><span>{app.copy.asrPanel.translationModel}</span><strong>{app.subtitleTranslationModelLabel}</strong></div> : null}
    {app.translationServiceStatusLabel ? <div className={`subtitle-translation-row translation-service-status ${app.translationServiceStatusTone}`} title={app.translationServiceTestMessage?.message ?? undefined}><span>{app.copy.asrPanel.translationServiceStatus}</span><strong>{app.translationServiceStatusLabel}</strong></div> : null}
    <ProgressBlock />{app.asrNotice ? <div className={`asr-result ${app.asrNotice.success ? 'success' : 'failed'}`}>{app.asrNotice.message}</div> : null}<AsrErrorDiagnostics /><SubtitleResultSummary />
    <div className="asr-action-row"><button className="asr-action-button primary" type="button" onClick={app.generateSubtitle} disabled={!app.canGenerateSubtitle}><Sparkles size={16} />{app.isAsrBusy ? app.copy.asrPanel.generatingSubtitle : app.copy.asrPanel.generateSubtitle}</button><button className="asr-action-button" type="button" onClick={() => app.isTranslatingSubtitle ? void app.cancelTranslation() : void app.translateSubtitle()} disabled={!app.canTranslateSubtitle && !app.isTranslatingSubtitle}>{app.isTranslatingSubtitle ? <X size={16} /> : <Languages size={16} />}{app.isTranslatingSubtitle ? app.copy.asrPanel.cancelTranslation : app.copy.asrPanel.translateSubtitle(app.subtitleTargetLanguageLabel)}</button><button className="asr-action-button summary-action-button" type="button" onClick={() => app.isSummarizingSubtitle ? void app.cancelSummary() : void app.summarizeSubtitle()} disabled={!app.canGenerateSummary && !app.isSummarizingSubtitle}>{app.isSummarizingSubtitle ? <X size={16} /> : <BookOpen size={16} />}{app.isSummarizingSubtitle ? app.copy.asrPanel.cancelSummary : app.copy.summary.generate}</button></div>
  </div>
}

function ProgressBlock(): React.ReactElement | null {
  const app = useAppContext()
  if (!app.asrProgress) return null
  const elapsed = app.isAsrBusy && app.asrElapsedMs != null ? app.copy.asrPanel.subtitleGenerationElapsed(app.formatElapsedTime(app.asrElapsedMs)) : app.isTranslatingSubtitle && app.translationElapsedMs != null ? app.copy.asrPanel.translationElapsed(app.formatElapsedTime(app.translationElapsedMs)) : app.isSummarizingSubtitle && app.summaryElapsedMs != null ? app.copy.asrPanel.summaryElapsed(app.formatElapsedTime(app.summaryElapsedMs)) : null
  return <div className="progress-block"><div className="progress-label"><span>{app.asrProgress.message}</span><div className="progress-meta">{elapsed ? <span>{elapsed}</span> : null}<strong>{formatPercent(app.asrProgress.percent, app.copy.asrModelStatus.progressLabel)}</strong></div></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((app.asrProgress.percent ?? 0) * 100)}%` }} /></div></div>
}
