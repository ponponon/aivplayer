import { useEffect } from 'react'
import type { AppModel } from './app-types'

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
    const pauseVideo = (): void => { if (model.videoRef.current && !model.videoRef.current.paused) model.videoRef.current.pause() }
    const onVisibilityChange = (): void => { if (document.visibilityState === 'hidden') pauseVideo() }
    window.addEventListener('blur', pauseVideo)
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => { window.removeEventListener('blur', pauseVideo); document.removeEventListener('visibilitychange', onVisibilityChange) }
  }, [model.appSettings.playback.pauseWhenMinimized])

  useEffect(() => {
    const onFullscreenChange = (): void => model.setIsFullscreen(document.fullscreenElement === model.videoRef.current)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    onFullscreenChange()
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
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
