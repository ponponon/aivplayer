import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type {
  AppSettings,
  AppSettingsSectionId,
  AppSettingsSectionPatcher
} from '../../../shared/app-settings'
import type { AppUpdateState } from '../../../shared/app-update-types'
import type { AsrRuntimeSetupResult, AsrRuntimeStatus, AsrTranslationServiceTestResult } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'
import { useSettingsCacheManagement } from './use-settings-cache-management'
import { getSettingsTabs, createSettingsSectionProps, type SettingsTabId } from './settings-dialog-model'
import { GpuRestartDialog } from './gpu-restart-dialog'
import { SettingsTabs } from './settings-tabs'
import { SettingsSectionPanels } from './settings-section-panels'

export type SettingsDialogProps = {
  copy: LocaleCopy
  settings: AppSettings
  asrStatus: AsrRuntimeStatus | null
  runtimeSetupMessage: AsrRuntimeSetupResult | null
  translationServiceTestMessage: AsrTranslationServiceTestResult | null
  isDetectingWhisperBinary: boolean
  isSelectingWhisperBinary: boolean
  isTestingTranslationService: boolean
  initialSectionId?: AppSettingsSectionId
  patchSettingsSection: AppSettingsSectionPatcher
  onClose: () => void
  onAutoDetectWhisperBinary: () => void
  onOpenAsrPanel: () => void
  onPickDefaultFolder: () => Promise<string | null>
  onPickCaptureFolder: () => Promise<string | null>
  onSelectWhisperBinary: () => void
  onTestTranslationService: () => void
  onResetDefaults: () => void
  onRestartWithGpuAcceleration: (enabled: boolean) => Promise<void>
  appUpdateState: AppUpdateState
  onCheckForAppUpdate: () => Promise<AppUpdateState>
  onInstallAppUpdate: () => Promise<void>
}

export function SettingsDialog(props: SettingsDialogProps): ReactElement {
  const {
    copy,
    settings,
    asrStatus,
    translationServiceTestMessage,
    isTestingTranslationService,
    initialSectionId = 'general',
    patchSettingsSection,
    onClose,
    onOpenAsrPanel,
    onPickDefaultFolder,
    onPickCaptureFolder,
    onTestTranslationService,
    onResetDefaults,
    onRestartWithGpuAcceleration,
    appUpdateState,
    onCheckForAppUpdate,
    onInstallAppUpdate
  } = props
  const [activeSectionId, setActiveSectionId] = useState<SettingsTabId>(initialSectionId)
  const activeSectionIdRef = useRef<SettingsTabId>(initialSectionId)
  const dialogRef = useRef<HTMLElement | null>(null)
  const cacheManagement = useSettingsCacheManagement(copy)
  const [showRestartDialog, setShowRestartDialog] = useState(false)
  const [pendingGpuValue, setPendingGpuValue] = useState<boolean | null>(null)
  const [isRestartingGpu, setIsRestartingGpu] = useState(false)

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId
  }, [activeSectionId])

  useModalFocusTrap(true, dialogRef, '.settings-tab.active')

  useEffect(() => {
    setActiveSectionId(settings.ui.lastSettingsSectionId)
  }, [settings.ui.lastSettingsSectionId])

  const selectSection = (sectionId: SettingsTabId): void => {
    if (activeSectionIdRef.current === sectionId) {
      return
    }
    activeSectionIdRef.current = sectionId
    setActiveSectionId(sectionId)
    if (sectionId !== 'about') {
      patchSettingsSection('ui', { lastSettingsSectionId: sectionId })
    }
  }

  const tabs = getSettingsTabs(copy)

  const handleGpuAccelerationChange = (enabled: boolean): void => {
    setPendingGpuValue(enabled)
    setShowRestartDialog(true)
  }

  const confirmGpuChange = async (): Promise<void> => {
    if (pendingGpuValue === null || isRestartingGpu) return
    setIsRestartingGpu(true)
    try {
      await onRestartWithGpuAcceleration(pendingGpuValue)
    } catch {
      setIsRestartingGpu(false)
    }
  }

  const cancelGpuChange = (): void => {
    setShowRestartDialog(false)
    setPendingGpuValue(null)
  }

  const sectionProps = createSettingsSectionProps({
    copy,
    settings,
    activeSectionId,
    patchSettingsSection,
    asrStatus,
    translationServiceTestMessage,
    isTestingTranslationService,
    ...cacheManagement,
    onPickDefaultFolder,
    onPickCaptureFolder,
    onTestTranslationService,
    onRefreshCacheStats: cacheManagement.refreshCacheStats,
    onClearStaleCache: cacheManagement.clearStaleCache,
    onGpuAccelerationChange: handleGpuAccelerationChange
  })

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="settings-dialog settings-preferences-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-description"
      >
        <div className="settings-dialog-header">
          <div>
            <h2 id="settings-dialog-title">{copy.settingsDialog.title}</h2>
            <p id="settings-dialog-description">{copy.settingsDialog.description}</p>
          </div>
          <button className="mini-tool-button" type="button" onClick={onClose} title={copy.topbar.closeSettings}>
            <X size={14} />
          </button>
        </div>
        <div className="settings-body">
          <SettingsTabs copy={copy} tabs={tabs} activeSectionId={activeSectionId} onSelect={selectSection} />
          <SettingsSectionPanels
            copy={copy}
            tabs={tabs}
            sectionProps={sectionProps}
            activeSectionId={activeSectionId}
            updateState={appUpdateState}
            onCheckForUpdate={() => { void onCheckForAppUpdate() }}
            onInstallUpdate={() => { void onInstallAppUpdate() }}
          />
        </div>
        <div className="settings-footer">
          <div className="settings-note">
            <Sparkles size={14} />
            <span>{copy.settingsDialog.note}</span>
          </div>
          <div className="settings-footer-actions">
            <button className="settings-secondary-button" type="button" onClick={onResetDefaults}>
              {copy.settingsDialog.restoreDefaults}
            </button>
            <button className="asr-action-button" type="button" onClick={onOpenAsrPanel}>
              <Sparkles size={16} />
              {copy.settingsDialog.openAsrPanel}
            </button>
          </div>
        </div>
      </section>

      {showRestartDialog ? <GpuRestartDialog copy={copy} isRestarting={isRestartingGpu} onCancel={cancelGpuChange} onConfirm={() => void confirmGpuChange()} /> : null}
    </div>
  )
}
