import type { MouseEvent as ReactMouseEvent, SyntheticEvent } from 'react'
import type { PanelMode } from './player-state'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import type { PlaybackMemoryActions } from './use-playback-actions'
import { clamp } from '../lib/time'
import { VIDEO_SINGLE_CLICK_DELAY_MS, getMediaErrorMessage, getPlayFailureMessage } from './app-helpers'

export function usePlaybackControls(model: AppModel, derived: AppDerived, memory: PlaybackMemoryActions) {
  const clearControlDeckHideTimer = (): void => { if (model.controlDeckHideTimerRef.current != null) window.clearTimeout(model.controlDeckHideTimerRef.current); model.controlDeckHideTimerRef.current = null }
  const revealControlDeck = (): void => {
    clearControlDeckHideTimer(); model.setIsControlDeckVisible(true)
    if (!model.state.currentFile || !model.state.isPlaying || !model.appSettings.playback.autoHideControlDeck) return
    model.controlDeckHideTimerRef.current = window.setTimeout(() => { model.controlDeckHideTimerRef.current = null; model.setIsControlDeckVisible(false) }, Math.max(1, model.appSettings.playback.controlDeckAutoHideSeconds) * 1000)
  }
  const togglePanelMode = (panelMode: PanelMode): void => model.setState((current) => ({ ...current, panelMode: current.panelMode === panelMode ? 'none' : panelMode }))
  const openPanelMode = (panelMode: Exclude<PanelMode, 'none'>): void => model.setState((current) => ({ ...current, panelMode }))
  const setPlaybackError = (message: string): void => model.setState((current) => ({ ...current, error: message }))
  const clearPlaybackError = (): void => model.setState((current) => current.error ? { ...current, error: null } : current)
  const togglePlay = async (): Promise<void> => {
    revealControlDeck(); const video = model.videoRef.current
    if (!video || !model.state.currentFile) return
    if (!video.paused) { video.pause(); return }
    try { await video.play() } catch (error) { const message = getPlayFailureMessage(derived.copy, error); if (message) setPlaybackError(message) }
  }
  const seekBy = (seconds: number): void => { revealControlDeck(); const video = model.videoRef.current; if (video) video.currentTime = clamp(video.currentTime + seconds, 0, video.duration || 0) }
  const stopPlayback = (): void => {
    if (!model.state.currentFile) return
    revealControlDeck(); const video = model.videoRef.current; const file = model.state.currentFile
    if (video) { model.playbackEndedRef.current = false; video.currentTime = 0; video.pause(); model.setState((current) => ({ ...current, isPlaying: false, currentTime: 0 })); model.lastSavedProgressRef.current = { path: file.path, time: 0 }; memory.persistPlaybackProgress(0, true) }
    void window.aiv.stopNativePlayer().catch(() => undefined)
  }
  const playAdjacent = (direction: -1 | 1): void => { revealControlDeck(); if (!model.state.currentFile || model.state.playlist.length === 0) return; const index = model.state.playlist.findIndex((item) => item.path === model.state.currentFile?.path); memory.selectFile(model.state.playlist[clamp(index + direction, 0, model.state.playlist.length - 1)]) }
  const toggleMute = (): void => { revealControlDeck(); const video = model.videoRef.current; if (!video) return; const muted = !video.muted; video.muted = muted; model.setState((current) => ({ ...current, muted })); memory.syncPlaybackMemory(model.state.volume, muted, model.state.playbackRate) }
  const toggleFullscreen = async (): Promise<void> => { revealControlDeck(); const video = model.videoRef.current; if (!video) return; if (document.fullscreenElement) await document.exitFullscreen(); else await video.requestFullscreen() }
  const clearVideoClickTimer = (): void => { if (model.videoClickTimerRef.current != null) window.clearTimeout(model.videoClickTimerRef.current); model.videoClickTimerRef.current = null }
  const handleVideoClick = (event: ReactMouseEvent<HTMLVideoElement>): void => { event.preventDefault(); if (event.detail > 1) return; revealControlDeck(); if (!model.appSettings.playback.singleClickPause) return; clearVideoClickTimer(); model.videoClickTimerRef.current = window.setTimeout(() => { model.videoClickTimerRef.current = null; void togglePlay() }, VIDEO_SINGLE_CLICK_DELAY_MS) }
  const handleVideoDoubleClick = (event: ReactMouseEvent<HTMLVideoElement>): void => { event.preventDefault(); clearVideoClickTimer(); void toggleFullscreen() }
  const handleMediaError = (event: SyntheticEvent<HTMLVideoElement>): void => { const message = getMediaErrorMessage(derived.copy, event.currentTarget); if (message) setPlaybackError(message); else clearPlaybackError() }
  const seekTo = (seconds: number): void => {
    revealControlDeck()
    const video = model.videoRef.current
    const maxTime = video?.duration || model.state.duration
    const nextTime = maxTime > 0 ? clamp(seconds, 0, maxTime) : Math.max(0, seconds)
    if (video) { model.playbackEndedRef.current = false; video.currentTime = nextTime }
    model.setState((current) => ({ ...current, currentTime: nextTime }))
    if (model.state.currentFile) {
      model.lastSavedProgressRef.current = { path: model.state.currentFile.path, time: nextTime }
      memory.persistPlaybackProgress(nextTime, true)
    }
  }
  return { clearControlDeckHideTimer, revealControlDeck, togglePanelMode, openPanelMode, setPlaybackError, clearPlaybackError, togglePlay, seekBy, seekTo, stopPlayback, playAdjacent, toggleMute, toggleFullscreen, handleVideoClick, handleVideoDoubleClick, handleMediaError }
}
