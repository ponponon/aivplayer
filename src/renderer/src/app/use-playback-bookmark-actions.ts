import type { AppSettingsSectionPatcher } from '../../../shared/app-settings'
import { getPlaybackMediaKey, type PlaybackBookmark } from '../../../shared/playback-memory'
import type { AppModel } from './app-types'

export function usePlaybackBookmarkActions(model: AppModel, patchSection: AppSettingsSectionPatcher) {
  const createPlaybackBookmark = (name: string, timeSeconds = model.state.currentTime): void => {
    const file = model.state.currentFile
    if (!file) return
    const bookmark: PlaybackBookmark = {
      id: `bookmark-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      timeSeconds: Math.max(0, timeSeconds),
      name: name.trim() || `Bookmark ${Math.round(timeSeconds)}s`,
      createdAt: Date.now()
    }
    const key = getPlaybackMediaKey(file)
    patchSection('playback', (current) => ({
      ...current,
      bookmarksByFingerprint: {
        ...current.bookmarksByFingerprint,
        [key]: [...(current.bookmarksByFingerprint[key] ?? []), bookmark].sort((left, right) => left.timeSeconds - right.timeSeconds)
      }
    }))
  }
  const removePlaybackBookmark = (bookmarkId: string): void => {
    const file = model.state.currentFile
    if (!file) return
    const key = getPlaybackMediaKey(file)
    patchSection('playback', (current) => ({
      ...current,
      bookmarksByFingerprint: {
        ...current.bookmarksByFingerprint,
        [key]: (current.bookmarksByFingerprint[key] ?? []).filter((bookmark) => bookmark.id !== bookmarkId)
      }
    }))
  }
  return { createPlaybackBookmark, removePlaybackBookmark }
}
