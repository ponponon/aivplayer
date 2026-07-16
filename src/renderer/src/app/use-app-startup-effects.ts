import { useEffect } from 'react'
import type { MediaFile } from '../../../shared/media-types'
import type { AppModel } from './app-types'

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
        volume: settings.playback.rememberVolume ? settings.playback.lastVolume : current.volume,
        muted: settings.playback.rememberVolume ? settings.playback.lastMuted : current.muted,
        playbackRate: settings.playback.rememberPlaybackRate ? settings.playback.lastPlaybackRate : current.playbackRate,
        currentTime: settings.playback.rememberProgress && current.currentFile ? settings.playback.lastProgressByPath[current.currentFile.path] ?? current.currentTime : current.currentTime
      }))
    })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    void window.aiv.getInitialMediaFiles().then(loadFiles)
    return window.aiv.onMediaFilesOpened(loadFiles)
  }, [])

  useEffect(() => window.aiv.onAppMenuOpenSettings(() => model.setIsSettingsDialogOpen(true)), [])

  useEffect(() => {
    const cleanupDownload = window.aiv.onAsrModelDownloadProgress(model.setDownloadProgress)
    const cleanupJob = window.aiv.onAsrJobProgress(model.setAsrProgress)
    return () => { cleanupDownload(); cleanupJob() }
  }, [])
}
