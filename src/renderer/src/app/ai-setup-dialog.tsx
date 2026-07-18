import { Check, ChevronDown, ChevronRight, CircleAlert, Cpu, Download, KeyRound, RefreshCcw, Sparkles, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { formatBytes } from './app-helpers'
import { SettingsField } from './settings-controls'
import { SettingsTextInput } from './settings-inputs'
import { useAppContext } from './app-context'
import { useModalFocusTrap } from './use-modal-focus-trap'
import type { AiSetupStepId } from './use-ai-setup'

type SetupStepStatus = 'ready' | 'action' | 'checking'

export function AiSetupDialog(): React.ReactElement | null {
  const app = useAppContext()
  const dialogRef = useRef<HTMLElement | null>(null)
  const [activeStep, setActiveStep] = useState<AiSetupStepId>('runtime')

  const stepStatuses = useMemo<Record<AiSetupStepId, SetupStepStatus>>(() => ({
    runtime: app.asrStatus
      ? app.isAsrRuntimeReady ? 'ready' : 'action'
      : 'checking',
    model: app.isRecommendedModelReady ? 'ready' : app.isDownloadingModel ? 'checking' : 'action',
    translation: app.isTranslationReady ? 'ready' : 'action'
  }), [app.asrStatus, app.isAsrRuntimeReady, app.isRecommendedModelReady, app.isDownloadingModel, app.isTranslationReady])

  const firstActionStep = useMemo<AiSetupStepId>(() => {
    const ids: AiSetupStepId[] = needsAsrSetup(app)
      ? ['runtime', 'model', ...(needsTranslationSetup(app) ? ['translation' as const] : [])]
      : ['translation']
    return ids.find((id) => stepStatuses[id] !== 'ready') ?? 'translation'
  }, [app.aiSetupIntent, app.subtitlePath, stepStatuses])

  useEffect(() => {
    if (app.isAiSetupDialogOpen) setActiveStep(firstActionStep)
  }, [app.isAiSetupDialogOpen, firstActionStep])

  useModalFocusTrap(app.isAiSetupDialogOpen && !app.isDownloadDialogOpen, dialogRef, '.ai-setup-step-toggle')

  if (!app.isAiSetupDialogOpen || !app.aiSetupIntent) return null

  const isComplete = app.isReadyForAiSetup(app.aiSetupIntent)
  const intentLabel = app.aiSetupIntent === 'asr' ? app.copy.aiSetup.asrIntent : app.aiSetupIntent === 'translate' ? app.copy.aiSetup.translationIntent : app.copy.aiSetup.quickIntent

  return (
    <div className="modal-backdrop ai-setup-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) app.closeAiSetup() }}>
      <section ref={dialogRef} className="ai-setup-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="ai-setup-dialog-title" aria-describedby="ai-setup-dialog-description">
        <div className="ai-setup-header">
          <div>
            <span className="panel-kicker">{app.copy.aiSetup.kicker}</span>
            <h2 id="ai-setup-dialog-title">{app.copy.aiSetup.title}</h2>
            <p id="ai-setup-dialog-description">{app.copy.aiSetup.description(intentLabel)}</p>
          </div>
          <button className="mini-tool-button" type="button" onClick={app.closeAiSetup} title={app.copy.aiSetup.close}><X size={14} /></button>
        </div>

        <div className="ai-setup-steps">
          {needsAsrSetup(app) ? <SetupStep
            id="runtime"
            status={stepStatuses.runtime}
            active={activeStep === 'runtime'}
            icon={<Cpu size={16} />}
            title={app.copy.aiSetup.runtimeTitle}
            description={app.copy.aiSetup.runtimeDescription}
            statusLabel={getStatusLabel(app, stepStatuses.runtime)}
            onSelect={() => setActiveStep('runtime')}
          >
            <RuntimeStep />
          </SetupStep> : null}
          {needsAsrSetup(app) ? <SetupStep
            id="model"
            status={stepStatuses.model}
            active={activeStep === 'model'}
            icon={<Download size={16} />}
            title={app.copy.aiSetup.modelTitle}
            description={app.copy.aiSetup.modelDescription}
            statusLabel={getStatusLabel(app, stepStatuses.model)}
            onSelect={() => setActiveStep('model')}
          >
            <ModelStep />
          </SetupStep> : null}
          {needsTranslationSetup(app) ? <SetupStep
            id="translation"
            status={stepStatuses.translation}
            active={activeStep === 'translation'}
            icon={<KeyRound size={16} />}
            title={app.copy.aiSetup.translationTitle}
            description={app.copy.aiSetup.translationDescription}
            statusLabel={getStatusLabel(app, stepStatuses.translation)}
            onSelect={() => setActiveStep('translation')}
          >
            <TranslationStep />
          </SetupStep> : null}
        </div>

        <div className="ai-setup-footer">
          <p className="ai-setup-security-note"><KeyRound size={13} />{app.copy.aiSetup.securityNote}</p>
          <div className="ai-setup-footer-actions">
            <button className="settings-secondary-button" type="button" onClick={app.closeAiSetup}>{app.copy.aiSetup.later}</button>
            <button className="asr-action-button primary" type="button" onClick={() => void app.continueAiSetup()} disabled={!isComplete || app.isDownloadingModel || app.isTestingTranslationService}>
              <Sparkles size={15} />{app.copy.aiSetup.continueAction}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}

function needsAsrSetup(app: ReturnType<typeof useAppContext>): boolean {
  return app.aiSetupIntent === 'asr' || (app.aiSetupIntent === 'quick-complete' && !app.subtitlePath)
}

function needsTranslationSetup(app: ReturnType<typeof useAppContext>): boolean {
  return app.aiSetupIntent === 'translate' || app.aiSetupIntent === 'quick-complete'
}

function SetupStep({ id, status, active, icon, title, description, statusLabel, onSelect, children }: {
  id: AiSetupStepId
  status: SetupStepStatus
  active: boolean
  icon: React.ReactNode
  title: string
  description: string
  statusLabel: string
  onSelect: () => void
  children: React.ReactNode
}): React.ReactElement {
  return (
    <section className={`ai-setup-step ${active ? 'is-active' : ''} ${status === 'ready' ? 'is-ready' : ''}`}>
      <button className="ai-setup-step-toggle" type="button" onClick={onSelect} aria-expanded={active} aria-controls={`ai-setup-step-${id}`}>
        <span className="ai-setup-step-icon" aria-hidden="true">{icon}</span>
        <span className="ai-setup-step-copy"><strong>{title}</strong><small>{description}</small></span>
        <span className={`ai-setup-step-status ${status}`}><StatusIcon status={status} />{statusLabel}</span>
        {active ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
      </button>
      {active ? <div className="ai-setup-step-detail" id={`ai-setup-step-${id}`}>{children}</div> : null}
    </section>
  )
}

function StatusIcon({ status }: { status: SetupStepStatus }): React.ReactElement {
  if (status === 'ready') return <Check size={13} />
  if (status === 'checking') return <RefreshCcw className="ai-setup-spin" size={13} />
  return <CircleAlert size={13} />
}

function getStatusLabel(app: ReturnType<typeof useAppContext>, status: SetupStepStatus): string {
  if (status === 'ready') return app.copy.aiSetup.ready
  if (status === 'checking') return app.copy.aiSetup.checking
  return app.copy.aiSetup.needsAction
}

function RuntimeStep(): React.ReactElement {
  const app = useAppContext()
  if (!app.asrStatus) return <p className="ai-setup-detail-copy">{app.copy.asrPanel.detectingEngine}</p>
  if (!app.isAsrRuntimeReady) {
    const missingEngine = !app.asrStatus.binaryPath
    return <>
      <p className="ai-setup-detail-copy">{missingEngine ? app.copy.runtime.asrEngineMissing : app.copy.runtime.ffmpegMissing}</p>
      {missingEngine ? <div className="ai-setup-inline-actions"><button className="settings-secondary-button" type="button" onClick={() => void app.autoDetectWhisperBinary()} disabled={app.isDetectingWhisperBinary}><RefreshCcw size={14} />{app.isDetectingWhisperBinary ? app.copy.aiSetup.checking : app.copy.aiSetup.autoDetect}</button><button className="settings-secondary-button" type="button" onClick={app.selectWhisperBinary} disabled={app.isSelectingWhisperBinary}>{app.copy.aiSetup.selectEngine}</button></div> : <p className="ai-setup-detail-note">{app.copy.aiSetup.reinstallRuntime}</p>}
      {app.runtimeSetupMessage ? <div className={`asr-result ${app.runtimeSetupMessage.success ? 'success' : 'failed'}`}>{app.runtimeSetupMessage.message}</div> : null}
    </>
  }
  return <p className="ai-setup-detail-copy">{app.copy.aiSetup.runtimeReady(app.asrStatus.whisperVersion ?? 'whisper.cpp')}</p>
}

function ModelStep(): React.ReactElement {
  const app = useAppContext()
  const manifest = app.recommendedModelManifest
  if (!manifest) return <p className="ai-setup-detail-copy">{app.copy.asrPanel.detectingEngine}</p>
  if (app.isRecommendedModelReady) return <p className="ai-setup-detail-copy">{app.copy.aiSetup.modelReady(manifest.name)}</p>
  return <>
    <p className="ai-setup-detail-copy">{app.copy.aiSetup.modelDownloadDescription(manifest.name, formatBytes(manifest.expectedSizeBytes), manifest.ramRequirement)}</p>
    {app.downloadProgress ? <div className="progress-block"><div className="progress-label"><span>{app.downloadProgress.message}</span><strong>{app.downloadProgress.percent == null ? app.copy.asrModelStatus.progressLabel : `${Math.round(app.downloadProgress.percent * 100)}%`}</strong></div><div className="progress-track"><div className="progress-fill" style={{ width: `${Math.round((app.downloadProgress.percent ?? 0) * 100)}%` }} /></div></div> : null}
    <button className="asr-action-button primary" type="button" onClick={app.openModelDownloadDialog} disabled={!app.canDownloadRecommendedModel}><Download size={15} />{app.isDownloadingModel ? app.copy.modelView.downloadingLabel : app.copy.aiSetup.downloadModel}</button>
  </>
}

function TranslationStep(): React.ReactElement {
  const app = useAppContext()
  const settings = app.appSettings
  return <div className="ai-setup-translation-form">
    <p className="ai-setup-detail-copy">{app.copy.aiSetup.translationFormDescription}</p>
    <SettingsField title={app.copy.settingsDialog.subtitles.translationBaseUrl} description={app.copy.settingsDialog.subtitles.translationBaseUrlDescription}>
      <SettingsTextInput value={settings.asr.translationBaseUrl ?? ''} autoComplete="off" onChange={(value) => app.patchAppSettingsSection('asr', { translationBaseUrl: value.trim() || null })} />
    </SettingsField>
    <SettingsField title={app.copy.settingsDialog.subtitles.translationModel} description={app.copy.settingsDialog.subtitles.translationModelDescription}>
      <SettingsTextInput value={settings.asr.translationModel ?? ''} autoComplete="off" onChange={(value) => app.patchAppSettingsSection('asr', { translationModel: value.trim() || null })} />
    </SettingsField>
    <SettingsField title={app.copy.settingsDialog.subtitles.translationApiKey} description={app.copy.settingsDialog.subtitles.translationApiKeyDescription}>
      <SettingsTextInput type="password" value={settings.asr.translationApiKey ?? ''} autoComplete="new-password" onChange={(value) => app.patchAppSettingsSection('asr', { translationApiKey: value.trim() || null })} />
    </SettingsField>
    <div className="ai-setup-translation-actions">
      <button className="ai-setup-translation-test-button" type="button" onClick={app.testTranslationService} disabled={!app.isTranslationConfigured || app.isTestingTranslationService}><Sparkles size={14} />{app.isTestingTranslationService ? app.copy.settingsDialog.subtitles.translationServiceChecking : app.copy.settingsDialog.subtitles.translationServiceCheck}</button>
      <span className={`ai-setup-test-state ${app.translationServiceTestMessage?.success ? 'is-ready' : ''}`}>{app.translationServiceTestMessage?.success ? app.copy.aiSetup.testPassed : app.isTranslationConfigured ? app.copy.aiSetup.configured : app.copy.aiSetup.fillRequired}</span>
    </div>
    {app.translationServiceTestMessage ? <div className={`asr-result ${app.translationServiceTestMessage.success ? 'success' : 'failed'}`}>{app.translationServiceTestMessage.message}</div> : null}
  </div>
}
