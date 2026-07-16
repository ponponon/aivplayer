import { Clock, RefreshCcw, Sparkles } from 'lucide-react'
import { getAsrRuntimeStatusMessage } from './app-helpers'
import { useAppContext } from './app-context'

export function AsrRuntimeCard(): React.ReactElement {
  const app = useAppContext()
  const status = app.asrStatus
  return <div className="asr-card open"><div className="asr-card-heading"><div className="asr-card-title"><Sparkles size={18} /><span>{app.copy.asrPanel.engineStatus}</span></div><button className="mini-tool-button" type="button" onClick={app.refreshAsrStatus} title={app.copy.asrPanel.refreshEngine}><RefreshCcw size={14} /></button></div><p>{getAsrRuntimeStatusMessage(app.copy, status)}</p><div className="asr-meta"><span><Clock size={14} />{app.installedModelCount} {app.copy.asrPanel.modelFiles}</span><span>{status?.available ? app.copy.asrPanel.engineReady : app.copy.asrPanel.engineNotReady}</span></div><div className="asr-runtime-grid"><span>{app.copy.asrPanel.engineStatus}</span><strong>{status?.binaryPath ? app.copy.asrPanel.engineReady : app.copy.asrPanel.engineNotReady}</strong><span>ffmpeg</span><strong>{status?.ffmpegPath ? app.copy.asrPanel.engineReady : app.copy.asrPanel.engineNotReady}</strong></div>{app.runtimeSetupMessage ? <div className={`asr-result ${app.runtimeSetupMessage.success ? 'success' : 'failed'}`}>{app.runtimeSetupMessage.message}</div> : null}</div>
}
