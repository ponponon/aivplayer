import type { AppSettingsSectionPatcher } from '../../../shared/app-settings'
import { getPlaybackMediaKey, type PlaybackBookmark, type PlaybackSegment, type PlaybackSegmentColor } from '../../../shared/playback-memory'
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
  const createPlaybackSegment = (name: string, startSeconds: number, endSeconds: number, color: PlaybackSegmentColor = 'accent'): PlaybackSegment | null => {
    const file = model.state.currentFile
    if (!file || !Number.isFinite(startSeconds) || !Number.isFinite(endSeconds)) return null
    const duration = model.videoRef.current?.duration && Number.isFinite(model.videoRef.current.duration) ? model.videoRef.current.duration : model.state.duration
    const start = Math.max(0, Math.min(startSeconds, duration > 0 ? duration : startSeconds))
    const end = Math.min(Math.max(start, endSeconds), duration > 0 ? duration : endSeconds)
    if (end <= start) return null
    const segment: PlaybackSegment = {
      id: `segment-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      startSeconds: Number(start.toFixed(3)),
      endSeconds: Number(end.toFixed(3)),
      name: name.trim() || `Segment ${Math.round(start)}-${Math.round(end)}s`,
      color,
      createdAt: Date.now()
    }
    const key = getPlaybackMediaKey(file)
    patchSection('playback', (current) => ({
      ...current,
      segmentsByFingerprint: {
        ...current.segmentsByFingerprint,
        [key]: [...(current.segmentsByFingerprint[key] ?? []), segment].sort((left, right) => left.startSeconds - right.startSeconds || left.endSeconds - right.endSeconds)
      }
    }))
    return segment
  }
  const removePlaybackSegment = (segmentId: string): void => {
    const file = model.state.currentFile
    if (!file) return
    const key = getPlaybackMediaKey(file)
    patchSection('playback', (current) => ({
      ...current,
      segmentsByFingerprint: {
        ...current.segmentsByFingerprint,
        [key]: (current.segmentsByFingerprint[key] ?? []).filter((segment) => segment.id !== segmentId)
      }
    }))
  }
  return { createPlaybackBookmark, removePlaybackBookmark, createPlaybackSegment, removePlaybackSegment }
}
