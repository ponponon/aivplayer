import { Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import type {
  AppSettings,
  AppSettingsSectionId,
  AppSettingsSectionPatcher
} from '../../../shared/app-settings'
import type { AsrRuntimeSetupResult, AsrRuntimeStatus, AsrTranslationServiceTestResult } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'
import { useSettingsCacheManagement } from './use-settings-cache-management'
import { getSettingsTabs, createSettingsSectionProps, type SettingsTab } from './settings-dialog-model'
import {
  CaptureSettingsSection,
  GeneralSettingsSection,
  InterfaceSettingsSection,
  ShortcutsSettingsSection,
  SubtitlesSettingsSection,
  VideoSettingsSection
} from './settings-sections'
import type { SettingsSectionProps } from './settings-section-types'

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
}

const sectionComponents: Record<AppSettingsSectionId, (props: SettingsSectionProps) => ReactElement> = {
  general: GeneralSettingsSection,
  interface: InterfaceSettingsSection,
  video: VideoSettingsSection,
  subtitles: SubtitlesSettingsSection,
  capture: CaptureSettingsSection,
  shortcuts: ShortcutsSettingsSection
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
    onResetDefaults
  } = props
  const [activeSectionId, setActiveSectionId] = useState<AppSettingsSectionId>(initialSectionId)
  const activeSectionIdRef = useRef<AppSettingsSectionId>(initialSectionId)
  const dialogRef = useRef<HTMLElement | null>(null)
  const cacheManagement = useSettingsCacheManagement(copy)

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId
  }, [activeSectionId])

  useModalFocusTrap(true, dialogRef, '.settings-tab.active')

  useEffect(() => {
    setActiveSectionId(settings.ui.lastSettingsSectionId)
  }, [settings.ui.lastSettingsSectionId])

  const selectSection = (sectionId: AppSettingsSectionId): void => {
    if (activeSectionIdRef.current === sectionId) {
      return
    }
    activeSectionIdRef.current = sectionId
    setActiveSectionId(sectionId)
    patchSettingsSection('ui', { lastSettingsSectionId: sectionId })
  }

  const tabs = getSettingsTabs(copy)
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
    onClearStaleCache: cacheManagement.clearStaleCache
  })

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section
        ref={dialogRef}
        className="settings-dialog"
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
          <div className="settings-grid">
            {tabs.map(({ id }) => {
              const Section = sectionComponents[id]
              return <Section key={id} {...sectionProps} />
            })}
          </div>
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
    </div>
  )
}

type SettingsTabsProps = {
  copy: LocaleCopy
  tabs: SettingsTab[]
  activeSectionId: AppSettingsSectionId
  onSelect: (sectionId: AppSettingsSectionId) => void
}

function SettingsTabs({ copy, tabs, activeSectionId, onSelect }: SettingsTabsProps): ReactElement {
  return (
    <nav className="settings-switcher" role="tablist" aria-label={copy.settingsDialog.title}>
      {tabs.map(({ id, label, ariaLabel, icon: Icon }) => {
        const isActive = activeSectionId === id
        return (
          <button
            className={`settings-tab ${isActive ? 'active' : ''}`}
            id={`settings-tab-${id}`}
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`settings-section-${id}`}
            aria-label={ariaLabel}
            data-settings-tab={id}
            onClick={() => onSelect(id)}
          >
            <Icon size={14} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
