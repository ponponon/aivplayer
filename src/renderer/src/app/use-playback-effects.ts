import { useEffect } from 'react'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { getPlayFailureMessage } from './app-helpers'
import { resolvePlaybackStartTime } from './playback-progress'
import { getPlaybackMediaKey } from '../../../shared/playback-memory'

export function usePlaybackEffects(model: AppModel, derived: AppDerived, revealControlDeck: () => void, clearControlDeckHideTimer: () => void, setPlaybackError: (message: string) => void, syncPlaybackState: (video?: HTMLVideoElement | null) => void): void {
  useEffect(() => {
    revealControlDeck()
    return clearControlDeckHideTimer
  }, [model.state.currentFile?.path, model.state.isPlaying, model.appSettings.playback.autoHideControlDeck, model.appSettings.playback.controlDeckAutoHideSeconds])

  useEffect(() => {
    const video = model.videoRef.current
    if (!video) return
    video.volume = model.state.volume
    video.playbackRate = model.state.playbackRate
    video.muted = model.state.muted
  }, [model.state.volume, model.state.playbackRate, model.state.muted])

  useEffect(() => {
    const video = model.videoRef.current
    if (!video || !model.state.currentFile) return
    const profile = model.appSettings.playback.profilesByFingerprint[getPlaybackMediaKey(model.state.currentFile)]
    const savedTime = model.appSettings.playback.rememberProgress
      ? profile?.positionSeconds ?? model.appSettings.playback.lastProgressByPath[model.state.currentFile.path] ?? 0
      : 0
    const startTime = savedTime > 0 ? savedTime : 0
    video.currentTime = startTime
    video.playbackRate = model.appSettings.playback.rememberPlaybackRate ? profile?.playbackRate ?? model.state.playbackRate : model.state.playbackRate
    video.volume = model.appSettings.playback.rememberVolume ? profile?.volume ?? model.state.volume : model.state.volume
    video.muted = model.appSettings.playback.rememberVolume ? profile?.muted ?? model.state.muted : model.state.muted
    model.lastSavedProgressRef.current = { path: model.state.currentFile.path, time: startTime }
    const timer = window.setTimeout(() => {
      void video.play().then(() => syncPlaybackState(video)).catch((error: unknown) => {
        syncPlaybackState(video)
        const message = getPlayFailureMessage(derived.copy, error)
        if (message) setPlaybackError(message)
      })
    }, 0)
    return () => window.clearTimeout(timer)
  }, [model.state.currentFile?.id, model.state.autoPlayRequestId, syncPlaybackState])

  useEffect(() => {
    const video = model.videoRef.current
    const file = model.state.currentFile
    if (!video || !file || !model.appSettings.playback.rememberProgress) return
    const profile = model.appSettings.playback.profilesByFingerprint[getPlaybackMediaKey(file)]
    const savedTime = profile?.positionSeconds ?? model.appSettings.playback.lastProgressByPath[file.path] ?? 0
    const nextTime = resolvePlaybackStartTime(savedTime, derived.mediaDurationSeconds)
    if (nextTime === 0 && model.playbackEndedRef.current) return
    if (Math.abs(video.currentTime - nextTime) < 0.25) return
    video.currentTime = nextTime
    model.lastSavedProgressRef.current = { path: file.path, time: nextTime }
    model.setState((current) => ({ ...current, currentTime: nextTime }))
  }, [model.state.currentFile?.path, model.appSettings.playback.rememberProgress, model.appSettings.playback.lastProgressByPath, model.appSettings.playback.profilesByFingerprint, derived.mediaDurationSeconds])
}
