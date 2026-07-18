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
import { useSummaryExport } from './use-summary-export'
import { useAiWorkflow } from './use-ai-workflow'
import { useAppEffects } from './use-app-effects'
import { useAiSetup } from './use-ai-setup'

export function useAppController() {
  const model = useAppModel()
  const derived = useAppDerived(model)
  const settings = useSettingsActions(model, derived)
  const playback = usePlaybackActions(model, derived, settings.patchAppSettingsSection)
  const runtime = useAsrRuntimeActions(model, derived)
  const aiSetup = useAiSetup(model, derived, runtime.refreshAsrStatus, playback.openPanelMode)
  const generation = useSubtitleGeneration(model, derived, (resumeAction) => {
    if (aiSetup.isReadyForAiSetup('asr')) return false
    aiSetup.openAiSetup('asr', resumeAction)
    return true
  })
  const translation = useSubtitleTranslation(model, derived, settings.patchSubtitleDisplaySettings, (resumeAction) => {
    if (aiSetup.isReadyForAiSetup('translate')) return false
    aiSetup.openAiSetup('translate', resumeAction)
    return true
  })
  const summary = useSubtitleSummary(model, derived, generation.generateSubtitle, playback.openPanelMode)
  const summaryExport = useSummaryExport(model, derived)
  const aiWorkflow = useAiWorkflow(model, derived, generation.generateSubtitle, generation.cancelSubtitle, translation, summary, playback.openPanelMode)
  const subtitleFiles = useSubtitleFileActions(model, derived)
  const quickSubtitle = useQuickSubtitleAction(
    model,
    derived,
    settings.patchSubtitleDisplaySettings,
    translation.translateSubtitle,
    aiWorkflow.startAiWorkflow,
    aiSetup.isReadyForAiSetup,
    aiSetup.openAiSetup
  )
  const clip = useClipExportActions(model, derived, settings.syncClipExportPreferences)
  useAppEffects(model, derived, { ...playback, ...runtime, ...quickSubtitle }, settings.patchSubtitleDisplaySettings)

  return { ...model, ...derived, ...settings, ...playback, ...runtime, ...generation, ...translation, ...summary, ...summaryExport, ...aiWorkflow, ...subtitleFiles, ...quickSubtitle, ...clip, ...aiSetup }
}
