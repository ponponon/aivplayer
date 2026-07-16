import { FileText, Info, ListChecks, ListVideo, Sparkles } from 'lucide-react'
import type { PanelMode } from './player-state'
import { useAppContext } from './app-context'

const tabs: Array<{ id: Exclude<PanelMode, 'none' | 'subtitles'>; icon: typeof Info; label: (copy: ReturnType<typeof useAppContext>['copy']) => string }> = [
  { id: 'playlist', icon: ListVideo, label: (copy) => copy.panels.playlistTitle },
  { id: 'asr', icon: Sparkles, label: (copy) => copy.panels.asrTitle },
  { id: 'batch', icon: ListChecks, label: (copy) => copy.panels.batchTitle },
  { id: 'summary', icon: FileText, label: (copy) => copy.panels.summaryTitle },
  { id: 'info', icon: Info, label: (copy) => copy.panels.infoTitle }
]

export function PanelTabs(): React.ReactElement {
  const app = useAppContext()
  return <div className="panel-switcher" role="tablist" aria-label={app.copy.panels.playlistTitle}>{tabs.map(({ id, icon: Icon, label }) => { const tabLabel = label(app.copy); return <button key={id} className={`panel-tab ${app.state.panelMode === id ? 'active' : ''}`} type="button" role="tab" aria-label={tabLabel} title={tabLabel} aria-selected={app.state.panelMode === id} onClick={() => app.openPanelMode(id)}><Icon size={15} /><span>{tabLabel}</span></button> })}</div>
}
