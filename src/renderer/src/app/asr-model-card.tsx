import { Download, RefreshCcw } from 'lucide-react'
import { useAppContext } from './app-context'
import { AsrModelDownloadProgress } from './asr-model-download-progress'

export function AsrModelCard(): React.ReactElement {
  const app = useAppContext()
  const view = app.modelViewState
  const manifest = app.recommendedModelManifest
  return <div className="asr-card open"><div className="asr-card-heading"><div className="asr-card-title"><Download size={18} /><span>{app.copy.asrPanel.modelFiles}</span></div><span className={`asr-status-pill ${view?.installState ?? 'missing'}`}>{view?.statusLabel ?? app.copy.asrModelStatus.progressLabel}</span></div><p>{view?.description ?? app.copy.modelView.missing(manifest?.name ?? '', manifest?.ramRequirement ?? '')}</p><div className="asr-model-list">{app.asrStatus?.installedModels.length ? app.asrStatus.installedModels.map((model) => <div className="asr-model-item" key={model.path}><span>{model.name}</span><strong>{app.formatBytes(model.sizeBytes)}</strong></div>) : <div className="asr-model-item muted"><span>{manifest?.name ?? app.asrStatus?.recommendedModel ?? app.copy.asrPanel.noModel}</span><strong>{manifest ? app.formatBytes(manifest.expectedSizeBytes) : app.asrStatus?.recommendedModel ?? 'ggml-large-v3-turbo-q5_0.bin'}</strong></div>}</div>{app.downloadProgress && view?.shouldShowProgress ? <AsrModelDownloadProgress copy={app.copy} progress={app.downloadProgress} expectedSizeBytes={manifest?.expectedSizeBytes} className="asr-card-download-progress" /> : null}<button className="asr-action-button" type="button" onClick={app.openModelDownloadDialog} disabled={!app.canDownloadRecommendedModel}>{view?.installState.startsWith('installed') ? <RefreshCcw size={16} /> : <Download size={16} />}{view?.actionLabel ?? app.copy.modelView.downloadRecommended}</button></div>
}
