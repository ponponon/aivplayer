import { useEffect } from 'react'
import type { MediaFile } from '../../../shared/media-types'
import type { AppModel } from './app-types'
import { getPlaybackMediaKey } from '../../../shared/playback-memory'

export function useAppStartupEffects(model: AppModel, loadFiles: (files: MediaFile[]) => void, refreshAsrStatus: () => Promise<unknown>): void {
  useEffect(() => { void refreshAsrStatus() }, [])

  useEffect(() => {
    let cancelled = false
    void window.aiv.getAppSettings().then((settings) => {
      if (cancelled) return
      model.setAppSettings(settings)
      model.setState((current) => ({
        ...current,
        panelMode: settings.ui.defaultPanelMode,
        volume: settings.playback.rememberVolume ? current.currentFile ? settings.playback.profilesByFingerprint[getPlaybackMediaKey(current.currentFile)]?.volume ?? settings.playback.lastVolume : settings.playback.lastVolume : current.volume,
        muted: settings.playback.rememberVolume ? current.currentFile ? settings.playback.profilesByFingerprint[getPlaybackMediaKey(current.currentFile)]?.muted ?? settings.playback.lastMuted : settings.playback.lastMuted : current.muted,
        playbackRate: settings.playback.rememberPlaybackRate ? current.currentFile ? settings.playback.profilesByFingerprint[getPlaybackMediaKey(current.currentFile)]?.playbackRate ?? settings.playback.lastPlaybackRate : settings.playback.lastPlaybackRate : current.playbackRate,
        currentTime: settings.playback.rememberProgress && current.currentFile ? settings.playback.profilesByFingerprint[getPlaybackMediaKey(current.currentFile)]?.positionSeconds ?? settings.playback.lastProgressByPath[current.currentFile.path] ?? current.currentTime : current.currentTime
      }))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const removeMediaFilesListener = window.aiv.onMediaFilesOpened(loadFiles)
    void window.aiv.getInitialMediaFiles().then(loadFiles)
    return removeMediaFilesListener
  }, [])

  useEffect(() => window.aiv.onAppMenuOpenSettings(() => model.setIsSettingsDialogOpen(true)), [])

  useEffect(() => {
    const cleanupDownload = window.aiv.onAsrModelDownloadProgress(model.setDownloadProgress)
    const applyBootstrapState = (state: import('../../../shared/asr-model-bootstrap').AsrModelBootstrapState): void => {
      model.setAsrModelBootstrapState(state)
      if (state.status === 'downloading') {
        model.setIsDownloadingModel(true)
        model.setDownloadProgress(state.progress)
      } else if (state.status === 'ready' || state.status === 'error' || state.status === 'blocked') {
        model.setIsDownloadingModel(false)
        if (state.status === 'ready') model.setDownloadProgress(null)
      }
      if (state.status === 'ready') void refreshAsrStatus()
    }
    const cleanupBootstrap = window.aiv.onAsrModelBootstrapStateChanged(applyBootstrapState)
    const cleanupJob = window.aiv.onAsrJobProgress(model.setAsrProgress)
    void window.aiv.getAsrModelBootstrapState().then(applyBootstrapState)
    return () => { cleanupDownload(); cleanupBootstrap(); cleanupJob() }
  }, [])
}
