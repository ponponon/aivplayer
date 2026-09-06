export type TransportAction = 'play' | 'pause'
export type MuteAction = 'mute' | 'unmute'
export type ToggleAction = 'enable' | 'disable'
export type ShuffleAction = ToggleAction
export type FullscreenAction = 'enter' | 'exit'

export type FullscreenControlState = {
  isActive: boolean
  action: FullscreenAction
  isAvailable: boolean
}

/**
 * Interactive controls describe the action that the next click performs.
 * Keeping this mapping pure makes it impossible for an icon/label and its
 * handler to silently use opposite interpretations of the same state.
 */
export function getTransportAction(isPlaying: boolean): TransportAction {
  return isPlaying ? 'pause' : 'play'
}

export function getMuteAction(muted: boolean): MuteAction {
  return muted ? 'unmute' : 'mute'
}

export function getToggleAction(enabled: boolean): ToggleAction {
  return enabled ? 'disable' : 'enable'
}

export function getShuffleAction(enabled: boolean): ShuffleAction {
  return getToggleAction(enabled)
}

/**
 * `document.fullscreenElement` is the browser's source of truth. The target
 * is only needed to decide whether entering fullscreen is currently
 * possible. A foreign/stale fullscreen element still means the next action
 * is exit, matching `document.exitFullscreen()` exactly.
 */
export function getFullscreenControlState(fullscreenElement: Element | null, target: Element | null): FullscreenControlState {
  const isActive = Boolean(fullscreenElement)
  return {
    isActive,
    action: isActive ? 'exit' : 'enter',
    isAvailable: isActive || target !== null
  }
}
