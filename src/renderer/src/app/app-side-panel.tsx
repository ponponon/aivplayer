import { Captions } from 'lucide-react'
import { BatchSubtitlePanel } from './batch-subtitle-panel'
import { PanelTabs } from './panel-tabs'
import { PlaylistPanel } from './playlist-panel'
import { AsrPanel } from './asr-panel'
import { InfoPanel } from './info-panel'
import { useAppContext } from './app-context'

export function AppSidePanel(): React.ReactElement {
  const app = useAppContext()
  const panel = app.state.panelMode
  return <aside className={`side-panel panel-${panel}`} aria-label={app.copy.panels.playlistTitle}><PanelTabs /><div className={`panel-content panel-content-${panel}`}>{panel === 'playlist' ? <PlaylistPanel /> : null}{panel === 'asr' ? <AsrPanel /> : null}{panel === 'batch' ? <BatchSubtitlePanel copy={app.copy} targetLanguage={app.appSettings.subtitles.targetLanguage} modelId={app.asrStatus?.recommendedModelManifest.id} onTargetLanguageChange={app.changeBatchTargetLanguage} /> : null}{panel === 'subtitles' ? <><div className="panel-header"><div><span className="panel-kicker">{app.copy.panels.subtitlesKicker}</span><h2>{app.copy.panels.subtitlesTitle}</h2></div><Captions size={19} /></div><div className="panel-empty">{app.copy.panels.noSubtitles}</div></> : null}{panel === 'info' ? <InfoPanel /> : null}</div></aside>
}
