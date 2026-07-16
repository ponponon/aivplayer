import { useAppDerived } from './use-app-derived'
import { useAppModel } from './use-app-model'
import { useAsrRuntimeActions } from './use-asr-runtime-actions'
import { useClipExportActions } from './use-clip-export-actions'
import { usePlaybackActions } from './use-playback-actions'
import { useQuickSubtitleAction } from './use-quick-subtitle-action'
import { useSettingsActions } from './use-settings-actions'
import { useSubtitleFileActions } from './use-subtitle-file-actions'
import { useSubtitleGeneration } from './use-subtitle-generation'
import { useSubtitleTranslation } from './use-subtitle-translation'
import { useSubtitleSummary } from './use-subtitle-summary'
import { useAppEffects } from './use-app-effects'

export function useAppController() {
  const model = useAppModel()
  const derived = useAppDerived(model)
  const settings = useSettingsActions(model, derived)
  const playback = usePlaybackActions(model, derived, settings.patchAppSettingsSection)
  const runtime = useAsrRuntimeActions(model, derived)
  const generation = useSubtitleGeneration(model, derived)
  const translation = useSubtitleTranslation(model, derived, settings.patchSubtitleDisplaySettings)
  const summary = useSubtitleSummary(model, derived, generation.generateSubtitle, playback.openPanelMode)
  const subtitleFiles = useSubtitleFileActions(model, derived)
  const quickSubtitle = useQuickSubtitleAction(
    model,
    derived,
    playback.openPanelMode,
    settings.patchSubtitleDisplaySettings,
    generation.generateSubtitle,
    translation.translateSubtitle
  )
  const clip = useClipExportActions(model, derived, settings.syncClipExportPreferences)
  useAppEffects(model, derived, { ...playback, ...runtime, ...quickSubtitle }, settings.patchSubtitleDisplaySettings)

  return { ...model, ...derived, ...settings, ...playback, ...runtime, ...generation, ...translation, ...summary, ...subtitleFiles, ...quickSubtitle, ...clip }
}
