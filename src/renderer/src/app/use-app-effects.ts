import type { MediaFile } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { useAppStartupEffects } from './use-app-startup-effects'
import { useAsrCheckpointEffect } from './use-asr-checkpoint-effect'
import { useElapsedTimeEffects } from './use-elapsed-time-effects'
import { useKeyboardShortcuts } from './use-keyboard-shortcuts'
import { useMediaMetadataEffect } from './use-media-metadata-effect'
import { usePlaybackEffects } from './use-playback-effects'
import { useSubtitleCacheEffects } from './use-subtitle-cache-effects'
import { useWindowEffects } from './use-window-effects'
import { useWebDesktopSync } from './use-web-desktop-sync'

export function useAppEffects(model: AppModel, derived: AppDerived, actions: {
  loadFiles: (files: MediaFile[]) => void
  refreshAsrStatus: () => Promise<unknown>
  revealControlDeck: () => void
  clearControlDeckHideTimer: () => void
  setPlaybackError: (message: string) => void
  seekBy: (seconds: number) => void
  togglePlay: () => Promise<void>
  togglePanelMode: (panel: 'playlist' | 'asr' | 'batch' | 'info') => void
  toggleMute: () => void
  stopPlayback: () => void
  toggleFullscreen: () => Promise<void>
  openFiles: () => Promise<void>
  runQuickComplete: () => Promise<void>
  selectFile: (file: MediaFile) => void
  playAdjacent: (direction: -1 | 1) => void
  seekTo: (seconds: number) => void
}, patchDisplay: (patch: { displayMode?: 'source' | 'translation' | 'bilingual' }) => void): void {
  useAppStartupEffects(model, actions.loadFiles, actions.refreshAsrStatus)
  useElapsedTimeEffects(model)
  useMediaMetadataEffect(model)
  useAsrCheckpointEffect(model)
  usePlaybackEffects(model, derived, actions.revealControlDeck, actions.clearControlDeckHideTimer, actions.setPlaybackError)
  useSubtitleCacheEffects(model, derived, patchDisplay)
  useKeyboardShortcuts(model, actions)
  useWindowEffects(model)
  useWebDesktopSync(model, actions)
}
