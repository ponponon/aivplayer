import { Clock } from 'lucide-react'
import { useAppContext } from './app-context'

export function SubtitleResultSummary(): React.ReactElement {
  const app = useAppContext()
  const generated = app.subtitleResult?.success && app.subtitleResult.generationStats
  const translated = app.translatedSubtitleResult?.success && app.translatedSubtitleResult.translationStats
  return <>{generated ? <div className="translation-summary generation-summary"><div className="translation-summary-main"><Clock size={14} /><span>{app.copy.asrPanel.subtitleGenerationElapsed(app.formatElapsedTime(generated.elapsedMs))}</span><strong>{app.formatElapsedTime(generated.elapsedMs)}</strong></div><div className="translation-summary-meta"><span>{app.copy.asrPanel.subtitleGenerationStats(generated.subtitleCueCount)}</span>{generated.cacheHit ? <span className="translation-cache-badge">{app.copy.asrPanel.subtitleGenerationCacheHit}</span> : null}</div></div> : null}{translated ? <div className="translation-summary"><div className="translation-summary-main"><Clock size={14} /><span>{app.copy.asrPanel.translationElapsed(app.formatElapsedTime(translated.elapsedMs))}</span><strong>{app.formatElapsedTime(translated.elapsedMs)}</strong></div><div className="translation-summary-meta"><span>{app.copy.asrPanel.translationStats(translated.subtitleCueCount, translated.translationBatchCount)}</span>{translated.cacheHit ? <span className="translation-cache-badge">{app.copy.asrPanel.translationCacheHit}</span> : null}{translated.endToEndElapsedMs != null ? <span>{app.copy.asrPanel.translationEndToEnd(app.formatElapsedTime(translated.endToEndElapsedMs))}</span> : null}</div></div> : null}</>
}
