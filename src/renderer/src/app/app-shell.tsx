import { AppHeader } from './app-header'
import { AppOverlays } from './app-overlays'
import { AppSidePanel } from './app-side-panel'
import { AiWorkflowStatus } from './ai-workflow-status'
import { PlayerStage } from './player-stage'
import { ImageWorkspace } from './image-workspace'
import { useAppContext } from './app-context'

export function AppShell(): React.ReactElement {
  const app = useAppContext()
  const onDrop = (event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault()
    const paths = Array.from(event.dataTransfer.files).map((file) => window.aiv.getPathForFile(file)).filter(Boolean)
    void app.createMediaFilesFromPaths(paths).then(app.loadFiles)
  }
  return <div className="app-shell" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}><AppHeader /><div className="app-surface"><div className={`app-surface-pane ${app.viewMode === 'image' ? 'active' : ''}`} aria-hidden={app.viewMode !== 'image'}><ImageWorkspace /></div><div className={`app-surface-pane ${app.viewMode === 'video' ? 'active' : ''}`} aria-hidden={app.viewMode !== 'video'}><main className={`workspace ${app.isSidePanelVisible ? 'with-side-panel' : 'side-panel-collapsed'}`}><PlayerStage /><AppSidePanel /></main></div></div><AiWorkflowStatus /><AppOverlays /></div>
}
