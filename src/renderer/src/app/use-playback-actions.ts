import type { AppSettingsSectionPatcher } from '../../../shared/app-settings'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'
import { usePlaybackControls } from './use-playback-controls'
import { usePlaybackMemoryActions } from './use-playback-memory-actions'

export type PlaybackMemoryActions = ReturnType<typeof usePlaybackMemoryActions>

export function usePlaybackActions(model: AppModel, derived: AppDerived, patchSection: AppSettingsSectionPatcher) {
  const memory = usePlaybackMemoryActions(model, patchSection)
  const controls = usePlaybackControls(model, derived, memory)
  return { ...memory, ...controls }
}
