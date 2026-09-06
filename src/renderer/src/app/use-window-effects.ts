import { useEffect } from 'react'
import type { AppModel } from './app-types'
import { syncPlayerPlayingState } from './playback-state'
import { getFullscreenControlState } from './control-state'

export function useWindowEffects(model: AppModel): void {
  useEffect(() => {
    const closeSubtitleActions = (event: MouseEvent): void => {
      const details = model.subtitleActionsRef.current
      if (details?.open && !(event.target instanceof Node && details.contains(event.target))) details.open = false
    }
    const closeDisplayControls = (event: PointerEvent): void => {
      const details = model.subtitleDisplayControlsRef.current
      if (details?.open && !(event.target instanceof Node && details.contains(event.target))) details.open = false
    }
    window.addEventListener('mousedown', closeSubtitleActions)
    window.addEventListener('pointerdown', closeDisplayControls)
    return () => { window.removeEventListener('mousedown', closeSubtitleActions); window.removeEventListener('pointerdown', closeDisplayControls) }
  }, [])

  useEffect(() => {
    if (!model.appSettings.playback.pauseWhenMinimized) return
    const pauseVideo = (): void => {
      const video = model.videoRef.current
      if (!video || video.paused) return
      video.pause()
      syncPlayerPlayingState(model.setState, video, () => model.videoRef.current)
    }
    const onVisibilityChange = (): void => { if (document.visibilityState === 'hidden') pauseVideo() }
    window.addEventListener('blur', pauseVideo)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.removeEventListener('blur', pauseVideo); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [model.appSettings.playback.pauseWhenMinimized])

  useEffect(() => {
    const onFullscreenChange = (): void => {
      model.setIsFullscreen(getFullscreenControlState(document.fullscreenElement, model.fullscreenRef.current).isActive)
    }
    document.addEventListener('fullscreenchange', onFullscreenChange)
    document.addEventListener('fullscreenerror', onFullscreenChange)
    onFullscreenChange()
    return () => { document.removeEventListener('fullscreenchange', onFullscreenChange); document.removeEventListener('fullscreenerror', onFullscreenChange) }
  }, [])

  useEffect(() => {
    if (!model.isDownloadDialogOpen) return
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !model.isDownloadingModel) model.setIsDownloadDialogOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [model.isDownloadDialogOpen, model.isDownloadingModel])

  useEffect(() => {
    if (!model.isSettingsDialogOpen) return
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape') model.setIsSettingsDialogOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [model.isSettingsDialogOpen])

  useEffect(() => {
    if (!model.isClipExportDialogOpen) return
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !model.isExportingClip) model.setIsClipExportDialogOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [model.isClipExportDialogOpen, model.isExportingClip])
}
