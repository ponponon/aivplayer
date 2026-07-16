import { useEffect } from 'react'
import type { AppModel } from './app-types'

type KeyboardActions = {
  revealControlDeck: () => void
  seekBy: (seconds: number) => void
  togglePlay: () => Promise<void>
  togglePanelMode: (panel: 'playlist' | 'asr' | 'batch' | 'info') => void
  toggleMute: () => void
  stopPlayback: () => void
  toggleFullscreen: () => Promise<void>
  openFiles: () => Promise<void>
  runQuickTargetSubtitle: () => Promise<void>
}

export function useKeyboardShortcuts(model: AppModel, actions: KeyboardActions): void {
  useEffect(() => {
    const clearHoldTimer = (): void => {
      if (model.holdRightArrowTimerRef.current != null) window.clearTimeout(model.holdRightArrowTimerRef.current)
      model.holdRightArrowTimerRef.current = null
    }
    const restoreSpeed = (): void => {
      clearHoldTimer()
      const previousRate = model.holdRightArrowRestoreRateRef.current
      if (previousRate == null) return
      model.holdRightArrowRestoreRateRef.current = null
      if (model.videoRef.current) model.videoRef.current.playbackRate = previousRate
      model.setState((current) => ({ ...current, playbackRate: previousRate }))
    }
    const isEditing = (target: EventTarget | null): boolean => target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLElement && target.isContentEditable
    const onKeyDown = (event: KeyboardEvent): void => {
      if (model.isDownloadDialogOpen || model.isSettingsDialogOpen || model.isClipExportDialogOpen || model.isExportingClip) return
      if (event.key === 'Escape') {
        if (document.fullscreenElement) { event.preventDefault(); void document.exitFullscreen(); return }
        if (model.subtitleDisplayControlsRef.current?.open) { model.subtitleDisplayControlsRef.current.open = false; return }
        if (model.subtitleActionsRef.current?.open) { model.subtitleActionsRef.current.open = false; return }
      }
      if (isEditing(event.target)) return
      if (event.code === 'Space') {
        if (event.repeat || event.target instanceof HTMLButtonElement) return
        event.preventDefault(); actions.revealControlDeck(); void actions.togglePlay(); return
      }
      if (event.code === 'ArrowLeft') { actions.revealControlDeck(); if (!event.repeat) actions.seekBy(-model.appSettings.playback.seekStepSeconds); return }
      if (event.code === 'ArrowRight') {
        actions.revealControlDeck()
        if (event.repeat) return
        actions.seekBy(model.appSettings.playback.seekStepSeconds)
        if (model.appSettings.playback.holdRightArrowSpeed > 1) {
          clearHoldTimer(); model.holdRightArrowRestoreRateRef.current = model.state.playbackRate
          model.holdRightArrowTimerRef.current = window.setTimeout(() => {
            if (!model.videoRef.current) return
            const heldSpeed = model.appSettings.playback.holdRightArrowSpeed
            model.videoRef.current.playbackRate = heldSpeed
            model.setState((current) => ({ ...current, playbackRate: heldSpeed }))
          }, 280)
        }
        return
      }
      if (event.code === 'KeyO' && (event.metaKey || event.ctrlKey)) { actions.revealControlDeck(); void actions.openFiles(); return }
      if (event.code === 'KeyL') { actions.revealControlDeck(); actions.togglePanelMode('playlist'); return }
      if (event.code === 'KeyC' && event.shiftKey && (event.metaKey || event.ctrlKey)) {
        if (!event.repeat && model.state.currentFile) { event.preventDefault(); actions.revealControlDeck(); void actions.runQuickTargetSubtitle() }
        return
      }
      if (!model.state.currentFile) return
      if (event.code === 'KeyM') { actions.revealControlDeck(); actions.toggleMute() }
      if (event.code === 'KeyS') { actions.revealControlDeck(); actions.stopPlayback() }
      if (event.code === 'KeyF') { actions.revealControlDeck(); void actions.toggleFullscreen() }
    }
    const onKeyUp = (event: KeyboardEvent): void => { if (event.code === 'ArrowRight') restoreSpeed() }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => { clearHoldTimer(); restoreSpeed(); window.removeEventListener('keydown', onKeyDown); window.removeEventListener('keyup', onKeyUp) }
  }, [model.state.currentFile?.path, model.state.playbackRate, model.appSettings.playback.seekStepSeconds, model.appSettings.playback.holdRightArrowSpeed, model.isDownloadDialogOpen, model.isSettingsDialogOpen, model.isClipExportDialogOpen, model.isExportingClip])
}
