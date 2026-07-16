import { Info } from 'lucide-react'
import { AudioStreamCard, CurrentFileCard, PlaybackInfoCard, SubtitleCacheCard, VideoStreamCard } from './info-panel-cards'
import { useAppContext } from './app-context'

export function InfoPanel(): React.ReactElement {
  const app = useAppContext()
  return <><div className="panel-header"><div><span className="panel-kicker">{app.copy.panels.infoKicker}</span><h2>{app.copy.panels.infoTitle}</h2></div><Info size={19} /></div>{app.state.currentFile ? <div className="info-stack"><CurrentFileCard /><VideoStreamCard /><AudioStreamCard /><PlaybackInfoCard /><SubtitleCacheCard /></div> : <div className="panel-empty">{app.copy.panels.noMedia}</div>}</>
}
