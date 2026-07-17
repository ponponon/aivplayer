import { AsrModelCard } from './asr-model-card'
import { AsrRuntimeCard } from './asr-runtime-card'
import { Sparkles } from 'lucide-react'
import { SubtitleToolsCard } from './subtitle-tools-card'
import { useAppContext } from './app-context'

export function AsrPanel(): React.ReactElement {
  const app = useAppContext()
  const runtimeReady = Boolean(app.asrStatus?.binaryPath && app.asrStatus?.ffmpegPath)
  const modelReady = Boolean(app.asrStatus?.installedModels.length)
  const subtitlesReady = runtimeReady && modelReady
  return <div className="asr-stack"><section className="asr-setup-guide" aria-label={app.copy.asrPanel.setupGuide}><div className="asr-setup-heading"><div><strong>{app.copy.asrPanel.setupGuide}</strong><span>{app.copy.asrPanel.setupDescription}</span></div><Sparkles size={16} /></div><div className="asr-setup-steps"><div className={`asr-setup-step ${runtimeReady ? 'is-ready' : ''}`}><b>1</b><span><strong>{app.copy.asrPanel.engineStatus}</strong><small>{runtimeReady ? app.copy.asrPanel.engineReady : app.copy.asrPanel.engineNotReady}</small></span></div><div className={`asr-setup-step ${modelReady ? 'is-ready' : ''}`}><b>2</b><span><strong>{app.copy.asrPanel.modelFiles}</strong><small>{modelReady ? app.copy.modelView.installedLabel : app.copy.modelView.missingLabel}</small></span></div><div className={`asr-setup-step ${subtitlesReady ? 'is-ready' : ''}`}><b>3</b><span><strong>{app.copy.asrPanel.generateSubtitle}</strong><small>{subtitlesReady ? app.copy.asrPanel.subtitlesReady : app.copy.asrPanel.subtitlesWaiting}</small></span></div></div></section><AsrRuntimeCard /><AsrModelCard /><SubtitleToolsCard /></div>
}
