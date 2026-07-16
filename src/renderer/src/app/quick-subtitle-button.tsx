import { Captions, Check, Languages } from 'lucide-react'
import { useAppContext } from './app-context'

export function QuickSubtitleButton(): React.ReactElement {
  const app = useAppContext()
  const icon = app.isTargetSubtitleReady ? <Check size={16} /> : app.subtitlePath ? <Languages size={16} /> : <Captions size={16} />
  return <button className={`quick-subtitle-button ${app.isTargetSubtitleReady ? 'is-ready' : ''}`} type="button" onClick={() => void app.runQuickTargetSubtitle()} disabled={!app.canQuickSubtitleAction} title={app.copy.quickSubtitle.shortcut} aria-keyshortcuts="Meta+Shift+C Control+Shift+C"><span className="quick-subtitle-icon" aria-hidden="true">{icon}</span><span className="quick-subtitle-copy"><strong>{app.quickSubtitleLabel}</strong><small>{app.copy.quickSubtitle.hint}</small></span></button>
}
