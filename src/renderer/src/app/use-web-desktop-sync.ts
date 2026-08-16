import { useEffect, useRef } from 'react'
import type { WebDesktopStateUpdate, WebRemoteCommandForDesktop } from '../../../shared/web-types'
import type { AppModel } from './app-types'
import { isMediaPlaying } from './playback-state'

type Actions = {
  togglePlay: () => Promise<void>
  playAdjacent: (direction: -1 | 1) => void
  seekTo: (seconds: number) => void
  selectFile: (file: AppModel['state']['playlist'][number]) => void
}

export function useWebDesktopSync(model: AppModel, actions: Actions): void {
  const latestStateRef = useRef<WebDesktopStateUpdate>({
    currentFilePath: null,
    playlistFilePaths: [],
    currentTime: 0,
    duration: 0,
    isPlaying: false,
    volume: 1,
    muted: false,
    playbackRate: 1
  })

  useEffect(() => {
    latestStateRef.current = {
      currentFilePath: model.state.currentFile?.path ?? null,
      playlistFilePaths: model.state.playlist.map((file) => file.path),
      currentTime: model.state.currentTime,
      duration: model.state.duration,
      isPlaying: model.state.isPlaying,
      volume: model.state.volume,
      muted: model.state.muted,
      playbackRate: model.state.playbackRate
    }
  }, [model.state.currentFile, model.state.currentTime, model.state.duration, model.state.isPlaying, model.state.muted, model.state.playbackRate, model.state.playlist, model.state.volume])

  useEffect(() => {
    if (!model.webShareStatus.running) return
    const publish = (): void => { void window.aiv.updateWebDesktopState(latestStateRef.current).catch(() => undefined) }
    publish()
    const timer = window.setInterval(publish, 1000)
    return () => window.clearInterval(timer)
  }, [model.webShareStatus.running])

  useEffect(() => window.aiv.onWebRemoteCommand((command) => {
    const video = model.videoRef.current
    const run = (action: () => void): void => { action() }
    const remoteCommand: WebRemoteCommandForDesktop = command
    if (remoteCommand.type === 'select') {
      const file = model.state.playlist.find((item) => item.path === remoteCommand.mediaPath)
      if (file) actions.selectFile(file)
      return
    }
    if (remoteCommand.type === 'play') {
      if (!isMediaPlaying(video)) void actions.togglePlay()
      return
    }
    if (remoteCommand.type === 'pause') {
      if (video && isMediaPlaying(video)) void actions.togglePlay()
      return
    }
    if (remoteCommand.type === 'toggle') { void actions.togglePlay(); return }
    if (remoteCommand.type === 'seek') { actions.seekTo(remoteCommand.position); return }
    if (remoteCommand.type === 'next') { actions.playAdjacent(1); return }
    if (remoteCommand.type === 'previous') { actions.playAdjacent(-1); return }
    if (remoteCommand.type === 'volume') {
      if (video) {
        video.volume = Math.min(1, Math.max(0, remoteCommand.volume))
        video.muted = remoteCommand.muted ?? false
      }
      run(() => model.setState((current) => ({ ...current, volume: Math.min(1, Math.max(0, remoteCommand.volume)), muted: remoteCommand.muted ?? false })))
    }
  }), [actions, model])
}
