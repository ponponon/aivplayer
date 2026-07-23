import { BatchSubtitlePanel } from './batch-subtitle-panel'
import { PanelTabs } from './panel-tabs'
import { PlaylistPanel } from './playlist-panel'
import { AsrPanel } from './asr-panel'
import { InfoPanel } from './info-panel'
import { SummaryPanel } from './summary-panel'
import { useAppContext } from './app-context'
import { VisionPanel } from './vision-panel'

export function AppSidePanel(): React.ReactElement {
  const app = useAppContext()
  const panel = app.state.panelMode
  return <aside className={`side-panel panel-${panel}`} aria-label={app.copy.panels.playlistTitle}><PanelTabs /><div className={`panel-content panel-content-${panel}`}>{panel === 'playlist' ? <PlaylistPanel /> : null}{panel === 'asr' ? <AsrPanel /> : null}{panel === 'batch' ? <BatchSubtitlePanel copy={app.copy} targetLanguage={app.appSettings.subtitles.targetLanguage} modelId={app.asrStatus?.recommendedModelManifest.id} onTargetLanguageChange={app.changeBatchTargetLanguage} /> : null}{panel === 'subtitles' ? <div className="panel-empty">{app.copy.panels.noSubtitles}</div> : null}{panel === 'summary' ? <SummaryPanel /> : null}{panel === 'info' ? <InfoPanel /> : null}{panel === 'vision' ? <VisionPanel /> : null}</div></aside>
}
