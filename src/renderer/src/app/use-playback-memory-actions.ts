import type { AppSettingsSectionPatcher } from '../../../shared/app-settings'
import type { MediaFile } from '../../../shared/media-types'
import type { AppModel } from './app-types'
import { getPlaylistFileByPath, mergePlaylist } from './app-helpers'

export function usePlaybackMemoryActions(model: AppModel, patchSection: AppSettingsSectionPatcher) {
  const getInitialPlaybackTime = (filePath: string): number => {
    if (!model.appSettings.playback.rememberProgress) return 0
    const saved = model.appSettings.playback.lastProgressByPath[filePath]
    return Number.isFinite(saved) && saved > 0 ? saved : 0
  }
  const persistPlaybackProgress = (currentTime: number, force = false): void => {
    const path = model.state.currentFile?.path
    if (!path || !model.appSettings.playback.rememberProgress) return
    const time = Math.max(0, currentTime)
    const previous = model.lastSavedProgressRef.current
    if (!force && previous.path === path && time - previous.time < 5) return
    model.lastSavedProgressRef.current = { path, time }
    patchSection('playback', (current) => ({ ...current, lastProgressByPath: { ...current.lastProgressByPath, [path]: time } }))
  }
  const syncPlaybackMemory = (volume: number, muted: boolean, playbackRate: number): void => {
    patchSection('playback', { lastVolume: muted ? 0 : volume, lastMuted: muted, lastPlaybackRate: playbackRate })
  }
  const resetSubtitleState = (): void => {
    model.setActiveSubtitle(null); model.setSubtitleResult(null); model.setTranslatedSubtitleResult(null); model.setSubtitleSummaryResult(null); model.setSummaryMode('quick'); model.setAsrNotice(null); model.setSummaryNotice(null); model.setAsrProgress(null); model.asrStartedAtRef.current = null; model.setAsrElapsedMs(null); model.translationStartedAtRef.current = null; model.setTranslationElapsedMs(null); model.summaryStartedAtRef.current = null; model.setSummaryElapsedMs(null); model.setIsSummarizingSubtitle(false)
  }
  const loadFiles = (files: MediaFile[]): void => {
    if (files.length === 0) return
    resetSubtitleState(); model.playbackEndedRef.current = false
    model.setState((current) => {
      const playlist = mergePlaylist(current.playlist, files)
      const currentFile = getPlaylistFileByPath(playlist, files[0])
      const currentTime = getInitialPlaybackTime(currentFile.path)
      model.lastSavedProgressRef.current = { path: currentFile.path, time: currentTime }
      return { ...current, playlist, currentFile, currentTime, duration: 0, videoWidth: 0, videoHeight: 0, isPlaying: false, autoPlayRequestId: current.autoPlayRequestId + 1, error: null }
    })
  }
  const openFiles = async (): Promise<void> => loadFiles(await window.aiv.openMediaFiles())
  const createMediaFilesFromPaths = async (paths: string[]): Promise<MediaFile[]> => Promise.all(paths.map((path) => window.aiv.createMediaFile(path)))
  const selectFile = (file: MediaFile): void => {
    resetSubtitleState(); model.playbackEndedRef.current = false
    const currentTime = getInitialPlaybackTime(file.path)
    model.lastSavedProgressRef.current = { path: file.path, time: currentTime }
    model.setState((current) => ({ ...current, currentFile: file, currentTime, duration: 0, videoWidth: 0, videoHeight: 0, isPlaying: false, autoPlayRequestId: current.autoPlayRequestId + 1, error: null }))
  }
  return { getInitialPlaybackTime, persistPlaybackProgress, syncPlaybackMemory, loadFiles, openFiles, createMediaFilesFromPaths, selectFile }
}
