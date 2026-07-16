import { AudioLines, Captions, Clock, FileText, ListVideo } from 'lucide-react'
import { InfoValue } from './info-value'
import { useAppContext } from './app-context'

export function CurrentFileCard(): React.ReactElement {
  const app = useAppContext()
  const file = app.state.currentFile
  if (!file) return <div className="panel-empty">{app.copy.panels.noMedia}</div>
  return <section className="info-card"><div className="info-card-heading"><FileText size={16} /><span>{app.copy.panels.currentFile}</span></div><div className="info-hero"><strong title={file.name}>{file.name}</strong><span>{(app.mediaContainerName ?? app.mediaContainerLabel) || '--'} · {app.copy.panels.loadedToPlayer}</span></div><div className="info-grid compact"><InfoItem label={app.copy.panels.containerFormat} value={app.mediaContainerLabel} /><InfoItem label={app.copy.panels.fileSize} value={app.mediaFileSizeLabel} /><InfoItem label={app.copy.panels.duration} value={app.mediaDurationLabel} /><InfoItem label={app.copy.panels.overallBitrate} value={app.mediaOverallBitrateLabel} /></div><div className="info-grid"><InfoItem label={app.copy.panels.fullPath} value={file.path} /><InfoItem label={app.copy.panels.mediaUrl} value={file.url} /></div><div className="info-card-actions"><button className="settings-secondary-button info-card-more-button" type="button" onClick={() => app.setIsMediaDetailsDialogOpen(true)} disabled={!app.mediaMetadata}>{app.copy.panels.moreDetails}</button></div></section>
}

export function VideoStreamCard(): React.ReactElement {
  const app = useAppContext()
  return <StreamCard icon={<ListVideo size={16} />} title={app.copy.panels.videoStream} items={[[app.copy.panels.resolution, app.mediaResolutionLabel], [app.copy.panels.frameRate, app.mediaFrameRateLabel], [app.copy.panels.videoCodec, app.mediaVideoCodecLabel], [app.copy.panels.displayAspectRatio, app.mediaAspectRatioLabel]]} />
}

export function AudioStreamCard(): React.ReactElement {
  const app = useAppContext()
  return <StreamCard icon={<AudioLines size={16} />} title={app.copy.panels.audioStream} items={[[app.copy.panels.audioCodec, app.mediaAudioCodecLabel], [app.copy.panels.channels, app.mediaAudioChannelsLabel], [app.copy.panels.sampleRate, app.mediaAudioSampleRateLabel], [app.copy.panels.audioBitrate, app.mediaAudioBitrateLabel]]} />
}

export function PlaybackInfoCard(): React.ReactElement {
  const app = useAppContext()
  return <StreamCard icon={<Clock size={16} />} title={app.copy.panels.playbackState} items={[[app.copy.controls.playbackPosition, app.playbackPositionInfoLabel], [app.copy.controls.playbackSpeed, app.playbackSpeedInfoLabel], [app.copy.controls.volume, app.playbackVolumeInfoLabel], [app.copy.asrPanel.cacheState, app.subtitleStatusLabel]]} />
}

export function SubtitleCacheCard(): React.ReactElement {
  const app = useAppContext()
  return <StreamCard icon={<Captions size={16} />} title={app.copy.panels.subtitleCache} items={[[app.copy.panels.vtt, app.subtitleVttStatusLabel, app.subtitlePath ?? undefined], [app.copy.panels.srt, app.subtitleSrtStatusLabel, app.subtitleSrtPath ?? undefined]]} />
}

function StreamCard(props: { icon: React.ReactElement; title: string; items: Array<[string, string, string?]> }): React.ReactElement {
  return <section className="info-card"><div className="info-card-heading">{props.icon}<span>{props.title}</span></div><div className="info-grid compact">{props.items.map(([label, value, tooltip]) => <InfoItem key={label} label={label} value={value} tooltip={tooltip} />)}</div></section>
}

function InfoItem(props: { label: string; value: string; tooltip?: string }): React.ReactElement {
  return <div className="info-item"><span>{props.label}</span><InfoValue value={props.value} tooltip={props.tooltip ?? undefined} /></div>
}
