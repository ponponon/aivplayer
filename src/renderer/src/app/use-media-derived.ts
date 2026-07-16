import { formatPlaybackTimeLabel, formatTime } from '../lib/time'
import { formatAspectRatio, formatBitrate, formatChannelLayout, formatCodecLabel, formatFileSize, formatFrameRate, formatMediaDuration, formatResolution, formatSampleRate } from './media-formatters'
import type { AppModel } from './app-types'

export function useMediaDerived(model: AppModel, copy: ReturnType<typeof import('../../../shared/i18n').getAppCopy>) {
  const format = model.mediaMetadata?.details?.format ?? null
  const durationSeconds = model.state.duration > 0 ? model.state.duration : model.mediaMetadata?.durationSeconds ?? null
  const width = model.state.videoWidth > 0 ? model.state.videoWidth : model.mediaMetadata?.video?.width ?? null
  const height = model.state.videoHeight > 0 ? model.state.videoHeight : model.mediaMetadata?.video?.height ?? null
  const containerName = typeof format?.format_name === 'string' && format.format_name.trim() ? format.format_name.trim() : null
  const containerLabel = typeof format?.format_long_name === 'string' && format.format_long_name.trim() ? format.format_long_name.trim() : typeof format?.format_name === 'string' && format.format_name.trim() ? format.format_name.trim() : model.state.currentFile?.extension?.toUpperCase() ?? '--'
  const video = model.mediaMetadata?.video ?? null
  const audio = model.mediaMetadata?.audio ?? null
  return {
    mediaDurationSeconds: durationSeconds,
    mediaVideoWidth: width,
    mediaVideoHeight: height,
    mediaContainerName: containerName,
    mediaContainerLabel: containerLabel,
    mediaFileSizeLabel: formatFileSize(model.mediaMetadata?.fileSizeBytes),
    mediaDurationLabel: formatMediaDuration(durationSeconds),
    mediaOverallBitrateLabel: formatBitrate(model.mediaMetadata?.overallBitrateKbps),
    mediaResolutionLabel: formatResolution(width, height),
    mediaAspectRatioLabel: formatAspectRatio(width, height, video?.displayAspectRatio ?? null),
    mediaVideoCodecLabel: formatCodecLabel(video?.codec ?? null, video?.profile ?? null),
    mediaFrameRateLabel: formatFrameRate(video?.frameRate),
    mediaAudioCodecLabel: formatCodecLabel(audio?.codec ?? null, audio?.profile ?? null),
    mediaAudioChannelsLabel: formatChannelLayout(audio?.channelLayout ?? null),
    mediaAudioSampleRateLabel: formatSampleRate(audio?.sampleRateHz),
    mediaAudioBitrateLabel: formatBitrate(audio?.bitRateKbps),
    playbackTimeLabel: formatPlaybackTimeLabel(model.state.currentTime, model.state.duration, model.appSettings.playback.showTotalPlaybackTime),
    playbackPositionInfoLabel: `${formatTime(model.state.currentTime)} / ${formatPlaybackTimeLabel(model.state.currentTime, model.state.duration, model.appSettings.playback.showTotalPlaybackTime)}`,
    playbackSpeedInfoLabel: `${model.state.playbackRate}x`,
    playbackVolumeInfoLabel: `${Math.round((model.state.muted ? 0 : model.state.volume) * 100)}%`,
    subtitleVttStatusLabel: model.activeSubtitle?.subtitlePath || model.subtitleResult?.subtitlePath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle,
    subtitleSrtStatusLabel: model.activeSubtitle?.subtitleSrtPath || model.subtitleResult?.subtitleSrtPath ? copy.panels.subtitleStatusCached : copy.panels.subtitleStatusIdle
  }
}
