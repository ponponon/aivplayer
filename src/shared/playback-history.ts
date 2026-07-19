import type { MediaFile } from './media-base-types'

export const MAX_PLAYBACK_HISTORY_ITEMS = 50

export type PlaybackHistoryEntry = {
  path: string
  name: string
  extension: string
  lastPlayedAt: number
  durationSeconds: number | null
}

export function upsertPlaybackHistory(
  history: readonly PlaybackHistoryEntry[],
  file: Pick<MediaFile, 'path' | 'name' | 'extension'>,
  lastPlayedAt = Date.now()
): PlaybackHistoryEntry[] {
  const existing = history.find((entry) => entry.path === file.path)
  return [
    {
      path: file.path,
      name: file.name,
      extension: file.extension,
      lastPlayedAt,
      durationSeconds: existing?.durationSeconds ?? null
    },
    ...history.filter((entry) => entry.path !== file.path)
  ].slice(0, MAX_PLAYBACK_HISTORY_ITEMS)
}

export function setPlaybackHistoryDuration(
  history: readonly PlaybackHistoryEntry[],
  filePath: string,
  durationSeconds: number
): PlaybackHistoryEntry[] {
  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return [...history]
  }

  return history.map((entry) => entry.path === filePath ? { ...entry, durationSeconds } : entry)
}

export function isUnfinishedPlaybackHistoryEntry(entry: PlaybackHistoryEntry, progressSeconds: number | undefined): boolean {
  const duration = entry.durationSeconds
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0 &&
    typeof progressSeconds === 'number' && Number.isFinite(progressSeconds) && progressSeconds > 0 && progressSeconds < duration
}

export function removePlaybackHistoryEntry(
  history: readonly PlaybackHistoryEntry[],
  filePath: string
): PlaybackHistoryEntry[] {
  return history.filter((entry) => entry.path !== filePath)
}

export function removePlaybackHistoryEntries(
  history: readonly PlaybackHistoryEntry[],
  filePaths: readonly string[]
): PlaybackHistoryEntry[] {
  const paths = new Set(filePaths)
  return history.filter((entry) => !paths.has(entry.path))
}
