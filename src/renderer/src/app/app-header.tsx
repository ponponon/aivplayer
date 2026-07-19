import { FileText, FolderOpen, Info, ListChecks, Minus, PanelRight, Scissors, Settings, Square, Sparkles, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useAppContext } from './app-context'

function WindowControls(): React.ReactElement {
  const app = useAppContext()
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    let active = true
    void window.aiv.getWindowMaximized().then((next) => {
      if (active) setIsMaximized(next)
    })
    return () => { active = false }
  }, [])

  useEffect(() => window.aiv.onWindowMaximizedChanged(setIsMaximized), [])

  const toggleMaximize = (): void => {
    void window.aiv.toggleMaximizeWindow().then(setIsMaximized)
  }

  return (
    <div className="window-controls">
      <button className="window-control" type="button" onClick={() => void window.aiv.minimizeWindow()} title={app.copy.topbar.minimizeWindow} aria-label={app.copy.topbar.minimizeWindow}>
        <Minus size={16} strokeWidth={1.8} />
      </button>
      <button className="window-control" type="button" onClick={toggleMaximize} title={isMaximized ? app.copy.topbar.restoreWindow : app.copy.topbar.maximizeWindow} aria-label={isMaximized ? app.copy.topbar.restoreWindow : app.copy.topbar.maximizeWindow}>
        <Square size={14} strokeWidth={1.8} />
      </button>
      <button className="window-control window-control-close" type="button" onClick={() => void window.aiv.closeWindow()} title={app.copy.topbar.closeWindow} aria-label={app.copy.topbar.closeWindow}>
        <X size={17} strokeWidth={1.8} />
      </button>
    </div>
  )
}

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
        <button className="tool-button clip-editor-tool-button" type="button" onClick={app.openClipExportDialog} disabled={!app.hasCurrentFile || app.isClipExportDialogOpen || app.isExportingClip} title={copy.topbar.openClipEditor} aria-label={copy.topbar.openClipEditor}><Scissors size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'playlist' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('playlist')} title={copy.topbar.togglePlaylist} aria-pressed={state.panelMode === 'playlist'}><PanelRight size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'asr' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('asr')} title={copy.topbar.toggleAsr} aria-pressed={state.panelMode === 'asr'}><Sparkles size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'batch' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('batch')} title={copy.topbar.toggleBatch} aria-pressed={state.panelMode === 'batch'}><ListChecks size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'summary' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('summary')} title={copy.topbar.toggleSummary} aria-pressed={state.panelMode === 'summary'}><FileText size={17} /></button>
        <button className={`tool-button ${state.panelMode === 'info' ? 'active' : ''}`} type="button" onClick={() => app.togglePanelMode('info')} title={copy.topbar.toggleInfo} aria-pressed={state.panelMode === 'info'}><Info size={17} /></button>
        <button className={`tool-button ${app.isSettingsDialogOpen ? 'active' : ''}`} type="button" onClick={toggleSettings} title={app.isSettingsDialogOpen ? copy.topbar.closeSettings : copy.topbar.openSettings} aria-label={app.isSettingsDialogOpen ? copy.topbar.closeSettings : copy.topbar.openSettings} aria-pressed={app.isSettingsDialogOpen}><Settings size={17} /></button>
      </nav>
      <WindowControls />
    </header>
  )
}
