import { FolderOpen } from 'lucide-react'
import { DiagnosticLogViewer } from './diagnostic-log-viewer'
import { useAppContext } from './app-context'

export function AsrErrorDiagnostics(): React.ReactElement | null {
  const app = useAppContext()
  if (!app.asrNotice || app.asrNotice.success) return null
  const details = app.asrErrorDetails
  return <div className="asr-error-diagnostics">{details ? <details className="asr-error-details"><summary>{app.copy.asrPanel.errorDetails}</summary><div className="asr-error-details-body">{details.code ? <span>Code: {details.code}</span> : null}{details.status ? <span>HTTP {details.status} {details.statusText ?? ''}</span> : null}{details.responseBody ? <pre>{details.responseBody}</pre> : null}</div></details> : null}<button className="batch-log-button" type="button" onClick={() => void app.openAsrLogDirectory()}><FolderOpen size={14} />{app.copy.asrPanel.openLogs}</button><DiagnosticLogViewer copy={app.copy.diagnostics} /></div>
}
