import type { LocaleCopy } from '../../../shared/i18n'
import type { AsrRuntimeStatus, MediaFile } from '../../../shared/media-types'
import type { SubtitleLanguageId, SubtitleTargetLanguageId } from '../../../shared/app-settings'

export const subtitleTargetLanguageIds: SubtitleTargetLanguageId[] = ['zh', 'en', 'ja', 'ko']
export const VIDEO_SINGLE_CLICK_DELAY_MS = 220

export function getPlayFailureMessage(copy: LocaleCopy, error: unknown): string | null {
  if (error instanceof DOMException && error.name === 'AbortError') return null
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error)
  return copy.runtime.playbackStartFailed(message)
}

export function getMediaErrorMessage(copy: LocaleCopy, video: HTMLVideoElement): string | null {
  const error = video.error
  if (!error || error.code === MediaError.MEDIA_ERR_ABORTED) return null
  if (error.code === MediaError.MEDIA_ERR_NETWORK) return copy.runtime.mediaReadFailed(error.message || copy.runtime.mediaReadFallback)
  if (error.code === MediaError.MEDIA_ERR_DECODE) return copy.runtime.videoDecodeFailed(error.message || copy.runtime.videoDecodeFallback)
  if (error.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) return copy.runtime.mediaSourceNotSupported(error.message || copy.runtime.mediaSourceNotSupportedFallback)
  return copy.runtime.playbackFailed(error.message || copy.runtime.unknownMediaError(error.code))
}

export function formatSubtitleLanguageLabel(copy: LocaleCopy, subtitleLanguage: string | null | undefined): string | null {
  if (!subtitleLanguage) return null
  return copy.subtitleLanguageOptions[subtitleLanguage as SubtitleLanguageId]?.label ?? subtitleLanguage
}

export function isSubtitleLanguageMatch(sourceLanguage: string | null | undefined, targetLanguage: SubtitleTargetLanguageId): boolean {
  const normalized = sourceLanguage?.trim().toLowerCase().replace(/_/g, '-')
  return Boolean(normalized && (normalized === targetLanguage || normalized.startsWith(`${targetLanguage}-`)))
}

export function getAsrRuntimeStatusMessage(copy: LocaleCopy, status: AsrRuntimeStatus | null): string {
  if (!status) return copy.asrPanel.detectingEngine
  if (!status.binaryPath) return copy.runtime.asrEngineMissing
  if (!status.ffmpegPath) return copy.runtime.ffmpegMissing
  return status.installedModels.length > 0
    ? copy.runtime.detectedWhisper(status.whisperVersion)
    : copy.runtime.detectedWhisperWithoutModels(status.recommendedModel)
}

export function mergePlaylist(current: MediaFile[], incoming: MediaFile[]): MediaFile[] {
  const seen = new Set(current.map((item) => item.path))
  return [...current, ...incoming.filter((item) => !seen.has(item.path))]
}

export function getPlaylistFileByPath(playlist: MediaFile[], file: MediaFile): MediaFile {
  return playlist.find((item) => item.path === file.path) ?? file
}

export function formatBytes(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${Math.round(bytes / 1024 / 1024)} MB`
}

export function formatPercent(value: number | null | undefined, fallbackLabel: string): string {
  return value == null ? fallbackLabel : `${Math.round(value * 100)}%`
}

export function formatElapsedTime(durationMs: number | null | undefined): string {
  if (durationMs == null || !Number.isFinite(durationMs) || durationMs < 0) return '—'
  const totalSeconds = Math.round(durationMs / 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`
}
