import type { AppSettingsSectionPatcher } from '../../../shared/app-settings'
import type { MediaFile } from '../../../shared/media-types'
import type { PlaybackHistoryEntry } from '../../../shared/playback-history'
import { getPlaybackMediaKey, type PlaybackMediaProfile } from '../../../shared/playback-memory'
import { removePlaybackHistoryEntries, removePlaybackHistoryEntry, setPlaybackHistoryDuration, upsertPlaybackHistory } from '../../../shared/playback-history'
import type { AppModel } from './app-types'
import { getPlaylistFileByPath, mergePlaylist } from './app-helpers'
import { usePlaybackBookmarkActions } from './use-playback-bookmark-actions'
import { syncPlayerPlayingState } from './playback-state'

export function usePlaybackMemoryActions(model: AppModel, patchSection: AppSettingsSectionPatcher) {
  const bookmarks = usePlaybackBookmarkActions(model, patchSection)
  const getInitialPlaybackState = (file: MediaFile): Pick<PlaybackMediaProfile, 'positionSeconds' | 'volume' | 'muted' | 'playbackRate'> => {
    const profile = model.appSettings.playback.profilesByFingerprint[getPlaybackMediaKey(file)]
    const savedByPath = model.appSettings.playback.lastProgressByPath[file.path]
    return {
      positionSeconds: model.appSettings.playback.rememberProgress
        ? profile?.positionSeconds ?? (Number.isFinite(savedByPath) && savedByPath > 0 ? savedByPath : 0)
        : 0,
      volume: model.appSettings.playback.rememberVolume && profile ? profile.volume : model.state.volume,
      muted: model.appSettings.playback.rememberVolume && profile ? profile.muted : model.state.muted,
      playbackRate: model.appSettings.playback.rememberPlaybackRate && profile ? profile.playbackRate : model.state.playbackRate
    }
  }
  const persistPlaybackProgress = (currentTime: number, force = false): void => {
    const file = model.state.currentFile
    const path = file?.path
    if (!file || !path || !model.appSettings.playback.rememberProgress) return
    const time = Math.max(0, currentTime)
    const previous = model.lastSavedProgressRef.current
    if (!force && previous.path === path && time - previous.time < 5) return
    model.lastSavedProgressRef.current = { path, time }
    const key = getPlaybackMediaKey(file)
    patchSection('playback', (current) => {
      const previousProfile = current.profilesByFingerprint[key]
      const profile: PlaybackMediaProfile = {
        positionSeconds: time,
        durationSeconds: model.state.duration > 0 ? model.state.duration : previousProfile?.durationSeconds ?? null,
        volume: model.state.volume,
        muted: model.state.muted,
        playbackRate: model.state.playbackRate,
        updatedAt: Date.now()
      }
      return {
        ...current,
        lastProgressByPath: { ...current.lastProgressByPath, [path]: time },
        profilesByFingerprint: { ...current.profilesByFingerprint, [key]: profile }
      }
    })
  }
  const syncPlaybackMemory = (volume: number, muted: boolean, playbackRate: number): void => {
    const file = model.state.currentFile
    const key = file ? getPlaybackMediaKey(file) : null
    patchSection('playback', (current) => ({
      ...current,
      lastVolume: muted ? 0 : volume,
      lastMuted: muted,
      lastPlaybackRate: playbackRate,
      ...(key ? {
        profilesByFingerprint: {
          ...current.profilesByFingerprint,
          [key]: {
            ...(current.profilesByFingerprint[key] ?? {
              positionSeconds: model.state.currentTime,
              durationSeconds: model.state.duration > 0 ? model.state.duration : null,
              updatedAt: Date.now()
            }),
            volume,
            muted,
            playbackRate,
            updatedAt: Date.now()
          }
        }
      } : {})
    }))
  }
  const recordPlaybackHistory = (file: MediaFile): void => {
    patchSection('playback', (current) => ({
      ...current,
      history: upsertPlaybackHistory(current.history, file)
    }))
  }
  const updatePlaybackHistoryDuration = (durationSeconds: number): void => {
    const path = model.state.currentFile?.path
    if (!path || !Number.isFinite(durationSeconds) || durationSeconds <= 0) return
    patchSection('playback', (current) => ({
      ...current,
      history: setPlaybackHistoryDuration(current.history, path, durationSeconds)
    }))
  }
  const removePlaybackHistory = (filePath: string): void => {
    patchSection('playback', (current) => ({
      ...current,
      history: removePlaybackHistoryEntry(current.history, filePath)
    }))
  }
  const removeUnavailablePlaybackHistory = (filePaths: readonly string[]): void => {
    if (filePaths.length === 0) return
    patchSection('playback', (current) => ({
      ...current,
      history: removePlaybackHistoryEntries(current.history, filePaths)
    }))
  }
  const clearPlaybackHistory = (): void => {
    patchSection('playback', { history: [] })
  }
  const resetSubtitleState = (): void => {
    model.setActiveSubtitle(null); model.setSubtitleResult(null); model.setTranslatedSubtitleResult(null); model.setSubtitleSummaryResult(null); model.setSummaryMode('quick'); model.setAsrNotice(null); model.setSummaryNotice(null); model.setAsrCheckpoint(null); model.setAsrProgress(null); model.asrStartedAtRef.current = null; model.setAsrElapsedMs(null); model.translationStartedAtRef.current = null; model.setTranslationElapsedMs(null); model.summaryStartedAtRef.current = null; model.setSummaryElapsedMs(null); model.setIsSummarizingSubtitle(false)
  }
  const loadFiles = (files: MediaFile[]): void => {
    if (files.length === 0) return
    const video = model.videoRef.current
    video?.pause()
    syncPlayerPlayingState(model.setState, video, model.videoRef.current)
    resetSubtitleState(); model.playbackEndedRef.current = false
    const playlist = mergePlaylist(model.state.playlist, files)
    const currentFile = getPlaylistFileByPath(playlist, files[0])
    recordPlaybackHistory(currentFile)
    model.setState((current) => {
      const initial = getInitialPlaybackState(currentFile)
      const currentTime = initial.positionSeconds
      model.lastSavedProgressRef.current = { path: currentFile.path, time: currentTime }
      return { ...current, playlist, currentFile, currentTime, volume: initial.volume, muted: initial.muted, playbackRate: initial.playbackRate, duration: 0, videoWidth: 0, videoHeight: 0, isPlaying: false, autoPlayRequestId: current.autoPlayRequestId + 1, error: null }
    })
  }
  const openFiles = async (): Promise<void> => loadFiles(await window.aiv.openMediaFiles())
  const createMediaFilesFromPaths = async (paths: string[]): Promise<MediaFile[]> => Promise.all(paths.map((path) => window.aiv.createMediaFile(path)))
  const selectFile = (file: MediaFile): void => {
    const video = model.videoRef.current
    video?.pause()
    syncPlayerPlayingState(model.setState, video, model.videoRef.current)
    resetSubtitleState(); model.playbackEndedRef.current = false
    recordPlaybackHistory(file)
    const initial = getInitialPlaybackState(file)
    const currentTime = initial.positionSeconds
    model.lastSavedProgressRef.current = { path: file.path, time: currentTime }
    model.setState((current) => ({ ...current, currentFile: file, currentTime, volume: initial.volume, muted: initial.muted, playbackRate: initial.playbackRate, duration: 0, videoWidth: 0, videoHeight: 0, isPlaying: false, autoPlayRequestId: current.autoPlayRequestId + 1, error: null }))
  }
  const openHistoryItem = async (entry: PlaybackHistoryEntry): Promise<boolean> => {
    try {
      if (!await window.aiv.isMediaFileAvailable(entry.path)) return false
      const existingFile = model.state.playlist.find((file) => file.path === entry.path)
      if (existingFile) {
        selectFile(existingFile)
        return true
      }

      const file = await window.aiv.createMediaFile(entry.path)
      loadFiles([file])
      return true
    } catch {
      return false
    }
  }
  return { ...bookmarks, persistPlaybackProgress, syncPlaybackMemory, recordPlaybackHistory, updatePlaybackHistoryDuration, removePlaybackHistory, removeUnavailablePlaybackHistory, clearPlaybackHistory, openHistoryItem, loadFiles, openFiles, createMediaFilesFromPaths, selectFile }
}
