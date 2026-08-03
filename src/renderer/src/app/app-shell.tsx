import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import type { AppThemePreference } from '../../../shared/app-settings'
import { AppHeader } from './app-header'
import { AppOverlays } from './app-overlays'
import { AppSidePanel } from './app-side-panel'
import { AiWorkflowStatus } from './ai-workflow-status'
import { PlayerStage } from './player-stage'
import { ImageWorkspace } from './image-workspace'
import { useAppContext } from './app-context'
import { useSidePanelResize } from './use-side-panel-resize'

type EffectiveTheme = Exclude<AppThemePreference, 'system'>

function readSystemTheme(): EffectiveTheme {
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark'
}

function useEffectiveTheme(preference: AppThemePreference): EffectiveTheme {
  const [systemTheme, setSystemTheme] = useState<EffectiveTheme>(readSystemTheme)
  const effectiveTheme = preference === 'system' ? systemTheme : preference

  useEffect(() => {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: light)')
    const handleChange = (): void => setSystemTheme(mediaQuery.matches ? 'light' : 'dark')

    handleChange()
    mediaQuery.addEventListener('change', handleChange)
    return () => mediaQuery.removeEventListener('change', handleChange)
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = effectiveTheme
    document.documentElement.style.colorScheme = effectiveTheme
  }, [effectiveTheme])

  return effectiveTheme
}

export function AppShell(): React.ReactElement {
  const app = useAppContext()
  const theme = useEffectiveTheme(app.appSettings.ui.theme)
  const commitSidePanelWidth = useCallback((width: number): void => {
    app.patchAppSettingsSection('ui', { sidePanelWidth: width })
  }, [app.patchAppSettingsSection])
  const sidePanelResize = useSidePanelResize(app.appSettings.ui.sidePanelWidth, commitSidePanelWidth)
  const workspaceStyle = { '--side-panel-width': `${sidePanelResize.width}px` } as CSSProperties
  const onDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const paths = Array.from(event.dataTransfer.files).map((file) => window.aiv.getPathForFile(file)).filter(Boolean)
    void app.createMediaFilesFromPaths(paths).then(app.loadFiles)
  }
  return <div className="app-shell" data-theme={theme} onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><AppHeader /><div className="app-surface"><div className={`app-surface-pane ${app.viewMode === 'image' ? 'active' : ''}`} aria-hidden={app.viewMode !== 'image'}><ImageWorkspace /></div><div className={`app-surface-pane ${app.viewMode === 'video' ? 'active' : ''}`} aria-hidden={app.viewMode !== 'video'}><main className={`workspace ${app.isSidePanelVisible ? 'with-side-panel' : 'side-panel-collapsed'} ${sidePanelResize.isDragging ? 'is-resizing-side-panel' : ''}`} style={workspaceStyle}><PlayerStage /><AppSidePanel sidePanelResize={sidePanelResize} /></main></div></div><AiWorkflowStatus /><AppOverlays /></div>
}
