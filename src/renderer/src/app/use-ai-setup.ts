import { useRef, useState } from 'react'
import type { AsrRuntimeStatus } from '../../../shared/media-types'
import type { AppDerived } from './use-app-derived'
import type { AppModel } from './app-types'

export type AiSetupIntent = 'asr' | 'quick-complete' | 'translate'
export type AiSetupStepId = 'runtime' | 'model' | 'translation'
export type AiSetupResumeAction = () => Promise<void>

export type AiSetupActions = {
  isAiSetupDialogOpen: boolean
  aiSetupIntent: AiSetupIntent | null
  openAiSetup: (intent: AiSetupIntent, resumeAction: AiSetupResumeAction) => void
  closeAiSetup: () => void
  continueAiSetup: () => Promise<void>
  isReadyForAiSetup: (intent: AiSetupIntent) => boolean
  isTranslationConfigured: boolean
  isTranslationReady: boolean
  isAsrRuntimeReady: boolean
  isRecommendedModelReady: boolean
}

function hasRecommendedModel(status: AsrRuntimeStatus | null): boolean {
  if (!status) return false
  return status.installedModels.some((model) => model.id === status.recommendedModelManifest.id)
}

export function useAiSetup(
  model: AppModel,
  derived: AppDerived,
  refreshAsrStatus: () => Promise<AsrRuntimeStatus>,
  openPanelMode: (panelMode: 'asr') => void
): AiSetupActions {
  const modelRef = useRef(model)
  const derivedRef = useRef(derived)
  modelRef.current = model
  derivedRef.current = derived

  const [isAiSetupDialogOpen, setIsAiSetupDialogOpen] = useState(false)
  const [aiSetupIntent, setAiSetupIntent] = useState<AiSetupIntent | null>(null)
  const [resumeAction, setResumeAction] = useState<AiSetupResumeAction | null>(null)

  const isAsrRuntimeReady = Boolean(model.asrStatus?.binaryPath && model.asrStatus.ffmpegPath)
  const isRecommendedModelReady = hasRecommendedModel(model.asrStatus)
  const isTranslationConfigured = Boolean(
    model.appSettings.asr.translationBaseUrl?.trim() &&
      model.appSettings.asr.translationModel?.trim() &&
      model.appSettings.asr.translationApiKey?.trim()
  )
  // 已保存的接口配置本身就足以继续翻译。测试结果只用于反馈连接是否成功，不能
  // 作为跨重启的硬门槛，否则应用每次启动都会把已经配置好的用户重新拦在引导里。
  const isTranslationReady = isTranslationConfigured

  const isReadyForAiSetup = (intent: AiSetupIntent): boolean => {
    const currentModel = modelRef.current
    const currentDerived = derivedRef.current
    const runtimeReady = Boolean(currentModel.asrStatus?.binaryPath && currentModel.asrStatus.ffmpegPath)
    const modelReady = hasRecommendedModel(currentModel.asrStatus)
    const translationConfigured = Boolean(
      currentModel.appSettings.asr.translationBaseUrl?.trim() &&
        currentModel.appSettings.asr.translationModel?.trim() &&
        currentModel.appSettings.asr.translationApiKey?.trim()
    )
    const translationReady = translationConfigured
    const needsAsr = intent === 'asr' || (intent === 'quick-complete' && !currentDerived.subtitlePath)
    if (needsAsr && (!runtimeReady || !modelReady)) return false
    if (intent === 'translate' || intent === 'quick-complete') return translationReady
    return needsAsr
  }

  const openAiSetup = (intent: AiSetupIntent, nextAction: AiSetupResumeAction): void => {
    openPanelMode('asr')
    setAiSetupIntent(intent)
    setResumeAction(() => nextAction)
    setIsAiSetupDialogOpen(true)
  }

  const closeAiSetup = (): void => {
    setIsAiSetupDialogOpen(false)
    setAiSetupIntent(null)
    setResumeAction(null)
  }

  const continueAiSetup = async (): Promise<void> => {
    if (!aiSetupIntent || !resumeAction) return
    const latestStatus = await refreshAsrStatus()
    const runtimeReady = Boolean(latestStatus.binaryPath && latestStatus.ffmpegPath)
    const modelReady = hasRecommendedModel(latestStatus)
    const currentModel = modelRef.current
    const currentDerived = derivedRef.current
    const translationReady = Boolean(
      currentModel.appSettings.asr.translationBaseUrl?.trim() &&
        currentModel.appSettings.asr.translationModel?.trim() &&
        currentModel.appSettings.asr.translationApiKey?.trim()
    )
    const needsAsr = aiSetupIntent === 'asr' || (aiSetupIntent === 'quick-complete' && !currentDerived.subtitlePath)
    const needsTranslation = aiSetupIntent === 'translate' || aiSetupIntent === 'quick-complete'

    if ((needsAsr && (!runtimeReady || !modelReady)) || (needsTranslation && !translationReady)) return

    const nextAction = resumeAction
    closeAiSetup()
    await nextAction()
  }

  return {
    isAiSetupDialogOpen,
    aiSetupIntent,
    openAiSetup,
    closeAiSetup,
    continueAiSetup,
    isReadyForAiSetup,
    isTranslationConfigured,
    isTranslationReady,
    isAsrRuntimeReady,
    isRecommendedModelReady,
  }
}
