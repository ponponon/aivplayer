import { FolderOpen, Info, ListChecks, PanelRight, Settings, Sparkles } from 'lucide-react'
import { useAppContext } from './app-context'

export function AppHeader(): React.ReactElement {
  const app = useAppContext()
  const { copy, state } = app
  const toggleSettings = (): void => {
    if (app.isDownloadDialogOpen || app.isClipExportDialogOpen || app.isExportingClip) return
    app.setIsSettingsDialogOpen((current) => !current)
  }
  return (
    <header className="titlebar">
      <div className="brand"><span className="brand-mark">A</span><span>{copy.appName}</span></div>
      <nav className="top-actions" aria-label="Primary">
        <button className="tool-button" type="button" onClick={app.openFiles} title={copy.topbar.openFiles}><FolderOpen size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'playlist' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('playlist')} title={copy.topbar.togglePlaylist} aria-pressed={state.panelMode === 'playlist'}><PanelRight size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'asr' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('asr')} title={copy.topbar.toggleAsr} aria-pressed={state.panelMode === 'asr'}><Sparkles size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'batch' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('batch')} title={copy.topbar.toggleBatch} aria-pressed={state.panelMode === 'batch'}><ListChecks size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'info' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('info')} title={copy.topbar.toggleInfo} aria-pressed={state.panelMode === 'info'}><Info size={17} /></button>
        <button className={`tool-button ${app.isSettingsDialogOpen ? 'active' : ''}`} type="button" onClick={toggleSettings} title={app.isSettingsDialogOpen ? copy.topbar.closeSettings : copy.topbar.openSettings} aria-label={app.isSettingsDialogOpen ? copy.topbar.closeSettings : copy.topbar.openSettings} aria-pressed={app.isSettingsDialogOpen}><Settings size={17} /></button>
      </nav>
    </header>
  )
}
