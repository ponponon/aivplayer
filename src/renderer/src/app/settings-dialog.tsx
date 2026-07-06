import {
  Camera,
  Captions,
  Clapperboard,
  FolderOpen,
  Keyboard,
  LayoutGrid,
  Settings2,
  Sparkles,
  X
} from 'lucide-react'
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement, type ReactNode } from 'react'
import type {
  AppPanelModePreference,
  AppSettings,
  AppSettingsSectionPatcher,
  AppSettingsSectionId,
  CaptureFileNamingMode,
  CaptureGifResolution,
  CaptureImageFormat
} from '../../../shared/app-settings'
import type { AsrModelSourceId, AsrRuntimeStatus, AsrRuntimeSetupResult } from '../../../shared/media-types'
import type { AppLocale, SubtitleLanguageId } from '../../../shared/localization'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'

type SettingsDialogProps = {
  copy: LocaleCopy
  settings: AppSettings
  asrStatus: AsrRuntimeStatus | null
  runtimeSetupMessage: AsrRuntimeSetupResult | null
  isDetectingWhisperBinary: boolean
  isSelectingWhisperBinary: boolean
  initialSectionId?: AppSettingsSectionId
  patchSettingsSection: AppSettingsSectionPatcher
  onClose: () => void
  onAutoDetectWhisperBinary: () => void
  onOpenAsrPanel: () => void
  onPickDefaultFolder: () => Promise<string | null>
  onPickCaptureFolder: () => Promise<string | null>
  onSelectWhisperBinary: () => void
  onResetDefaults: () => void
}

const settingsSectionOrder: AppSettingsSectionId[] = ['general', 'interface', 'video', 'subtitles', 'capture', 'shortcuts']

const SETTINGS_SECTION_SCROLL_OFFSET = 78

function formatPathLabel(pathValue: string | null, fallback: string): string {
  return pathValue && pathValue.length > 0 ? pathValue : fallback
}

type SettingsFieldProps = {
  title: ReactNode
  description?: ReactNode
  children: ReactNode
}

function SettingsField({ title, description, children }: SettingsFieldProps): ReactElement {
  return (
    <div className="settings-field">
      <div className="settings-field-copy">
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </div>
      {children}
    </div>
  )
}

type SettingsToggleProps = {
  title: ReactNode
  description?: ReactNode
  checked: boolean
  onChange: (checked: boolean) => void
}

function SettingsToggle({ title, description, checked, onChange }: SettingsToggleProps): ReactElement {
  return (
    <label className="setting-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>
        <strong>{title}</strong>
        {description ? <small>{description}</small> : null}
      </span>
    </label>
  )
}

type SettingsFolderPickerProps = {
  pathValue: string | null
  fallback: string
  selectLabel: ReactNode
  clearLabel?: ReactNode
  onPickFolder: () => Promise<string | null>
  onChange: (pathValue: string | null) => void
}

function SettingsFolderPicker({
  pathValue,
  fallback,
  selectLabel,
  clearLabel,
  onPickFolder,
  onChange
}: SettingsFolderPickerProps): ReactElement {
  return (
    <div className="settings-inline-row">
      <div className="settings-path-value" title={pathValue ?? ''}>
        {formatPathLabel(pathValue, fallback)}
      </div>
      <button
        className="settings-secondary-button"
        type="button"
        onClick={async () => {
          const folderPath = await onPickFolder()
          if (!folderPath) {
            return
          }

          onChange(folderPath)
        }}
      >
        <FolderOpen size={14} />
        {selectLabel}
      </button>
      {clearLabel ? (
        <button className="settings-secondary-button" type="button" onClick={() => onChange(null)} disabled={!pathValue}>
          {clearLabel}
        </button>
      ) : null}
    </div>
  )
}

type SettingsToggleValueRowProps = {
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  value: number
  onValueChange: (value: number) => void
  min: number
  max: number
  checkboxAriaLabel: string
  valueAriaLabel: string
  unit: ReactNode
}

function SettingsToggleValueRow({
  checked,
  onCheckedChange,
  value,
  onValueChange,
  min,
  max,
  checkboxAriaLabel,
  valueAriaLabel,
  unit
}: SettingsToggleValueRowProps): ReactElement {
  return (
    <div className="settings-inline-row">
      <input
        className="settings-checkbox"
        type="checkbox"
        checked={checked}
        onChange={(event) => onCheckedChange(event.currentTarget.checked)}
        aria-label={checkboxAriaLabel}
      />
      <SettingsNumberInput
        min={min}
        max={max}
        value={value}
        compact
        disabled={!checked}
        ariaLabel={valueAriaLabel}
        onChange={onValueChange}
      />
      <span className="settings-inline-unit">{unit}</span>
    </div>
  )
}

type SettingsSelectOption<TValue extends string> = {
  value: TValue
  label: string
}

type SettingsSelectProps<TValue extends string> = {
  value: TValue
  options: ReadonlyArray<SettingsSelectOption<TValue>>
  onChange: (value: TValue) => void
}

function SettingsSelect<TValue extends string>({ value, options, onChange }: SettingsSelectProps<TValue>): ReactElement {
  return (
    <select className="settings-select" value={value} onChange={(event) => onChange(event.currentTarget.value as TValue)}>
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}

type SettingsNumberInputProps = {
  value: number
  min: number
  max: number
  step?: number
  compact?: boolean
  disabled?: boolean
  ariaLabel?: string
  onChange: (value: number) => void
}

function SettingsNumberInput({
  value,
  min,
  max,
  step = 1,
  compact = false,
  disabled = false,
  ariaLabel,
  onChange
}: SettingsNumberInputProps): ReactElement {
  const settingsNumberClassName = compact ? 'settings-number settings-number-compact' : 'settings-number'

  return (
    <input
      className={settingsNumberClassName}
      type="number"
      min={min}
      max={max}
      step={step}
      value={value}
      disabled={disabled}
      aria-label={ariaLabel}
      onChange={(event) => {
        const nextValue = Number(event.currentTarget.value)
        if (Number.isFinite(nextValue)) {
          onChange(nextValue)
        }
      }}
    />
  )
}

export function SettingsDialog(props: SettingsDialogProps): ReactElement {
  const {
    copy,
    settings,
    asrStatus,
    initialSectionId = 'general',
    patchSettingsSection,
    onClose,
    onOpenAsrPanel,
    onPickDefaultFolder,
    onPickCaptureFolder,
    onResetDefaults
  } = props
  const [activeSectionId, setActiveSectionId] = useState<AppSettingsSectionId>(initialSectionId)
  const hasMountedRef = useRef(false)
  const initialScrollDoneRef = useRef(false)
  const dialogRef = useRef<HTMLElement | null>(null)
  const activeSectionIdRef = useRef<AppSettingsSectionId>(initialSectionId)
  const scrollFrameRef = useRef<number | null>(null)

  useEffect(() => {
    activeSectionIdRef.current = activeSectionId
  }, [activeSectionId])

  useLayoutEffect(() => {
    if (initialScrollDoneRef.current) {
      return
    }

    initialScrollDoneRef.current = true
    const element = document.getElementById(`settings-section-${initialSectionId}`)
    element?.scrollIntoView({
      behavior: 'auto',
      block: 'start'
    })
  }, [initialSectionId])

  useModalFocusTrap(true, dialogRef, '.settings-tab.active')

  useEffect(() => {
    return () => {
      if (scrollFrameRef.current != null) {
        window.cancelAnimationFrame(scrollFrameRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!hasMountedRef.current) {
      hasMountedRef.current = true
      return
    }

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

  const syncSectionFromScroll = (): void => {
    scrollFrameRef.current = null

    const container = dialogRef.current
    if (!container) {
      return
    }

    const containerTop = container.getBoundingClientRect().top
    let nextSectionId = activeSectionIdRef.current
    let bestDistance = Number.NEGATIVE_INFINITY

    for (const sectionId of settingsSectionOrder) {
      const element = document.getElementById(`settings-section-${sectionId}`)
      if (!element) {
        continue
      }

      const distance = element.getBoundingClientRect().top - containerTop
      if (distance <= SETTINGS_SECTION_SCROLL_OFFSET && distance > bestDistance) {
        bestDistance = distance
        nextSectionId = sectionId
      }
    }

    selectSection(nextSectionId)
  }

  const handleDialogScroll = (): void => {
    if (scrollFrameRef.current != null) {
      return
    }

    scrollFrameRef.current = window.requestAnimationFrame(syncSectionFromScroll)
  }

  const scrollToSection = (sectionId: AppSettingsSectionId): void => {
    selectSection(sectionId)

    const element = document.getElementById(`settings-section-${sectionId}`)
    element?.scrollIntoView({
      behavior: 'smooth',
      block: 'start'
    })
  }

  const languageOptions: Array<SettingsSelectOption<AppLocale>> = Object.entries(copy.languageOptions).map(
    ([locale, option]) => ({
      value: locale as AppLocale,
      label: option.label
    })
  )

  const subtitleLanguageOptions: Array<SettingsSelectOption<SubtitleLanguageId>> = Object.entries(
    copy.subtitleLanguageOptions
  ).map(([languageId, option]) => ({
    value: languageId as SubtitleLanguageId,
    label: option.label
  }))

  const sections: Array<{
    id: AppSettingsSectionId
    label: string
    ariaLabel: string
    icon: typeof Settings2
  }> = [
    { id: 'general', label: copy.settingsDialog.tabs.general, ariaLabel: copy.settingsDialog.tabAria.general, icon: Settings2 },
    { id: 'interface', label: copy.settingsDialog.tabs.interface, ariaLabel: copy.settingsDialog.tabAria.interface, icon: LayoutGrid },
    { id: 'video', label: copy.settingsDialog.tabs.video, ariaLabel: copy.settingsDialog.tabAria.video, icon: Clapperboard },
    { id: 'subtitles', label: copy.settingsDialog.tabs.subtitles, ariaLabel: copy.settingsDialog.tabAria.subtitles, icon: Captions },
    { id: 'capture', label: copy.settingsDialog.tabs.capture, ariaLabel: copy.settingsDialog.tabAria.capture, icon: Camera },
    { id: 'shortcuts', label: copy.settingsDialog.tabs.shortcuts, ariaLabel: copy.settingsDialog.tabAria.shortcuts, icon: Keyboard }
  ]

  const startupPanelOptions: Array<{ value: AppPanelModePreference; label: string }> = [
    { value: 'playlist', label: copy.panels.playlistTitle },
    { value: 'asr', label: copy.panels.asrTitle },
    { value: 'info', label: copy.panels.infoTitle }
  ]

  const modelSourceOptions: Array<{ value: AsrModelSourceId; label: string; description: string }> = [
    {
      value: 'modelscope',
      label: copy.modelSources.modelscope.title,
      description: copy.modelSources.modelscope.description
    },
    {
      value: 'huggingface',
      label: copy.modelSources.huggingface.title,
      description: copy.modelSources.huggingface.description
    }
  ]

  const captureImageFormatOptions: Array<{ value: CaptureImageFormat; label: string }> = [
    { value: 'jpg', label: copy.settingsDialog.capture.formats.jpg },
    { value: 'png', label: copy.settingsDialog.capture.formats.png }
  ]

  const captureFileNamingOptions: Array<{ value: CaptureFileNamingMode; label: string }> = [
    { value: 'sequential', label: copy.settingsDialog.capture.namingOptions.sequential },
    { value: 'timestamp', label: copy.settingsDialog.capture.namingOptions.timestamp }
  ]

  const captureGifResolutionOptions: Array<{ value: CaptureGifResolution; label: string }> = [
    { value: '360p', label: copy.settingsDialog.capture.resolutionOptions['360p'] },
    { value: '480p', label: copy.settingsDialog.capture.resolutionOptions['480p'] },
    { value: '720p', label: copy.settingsDialog.capture.resolutionOptions['720p'] }
  ]

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <section
        ref={dialogRef}
        className="settings-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-dialog-title"
        aria-describedby="settings-dialog-description"
        onScroll={handleDialogScroll}
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

        <nav className="settings-switcher" role="tablist" aria-label={copy.settingsDialog.title}>
          {sections.map((section) => {
            const Icon = section.icon
            const isActive = activeSectionId === section.id

            return (
              <button
                className={`settings-tab ${isActive ? 'active' : ''}`}
                key={section.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                aria-label={section.ariaLabel}
                data-settings-tab={section.id}
                onClick={() => scrollToSection(section.id)}
              >
                <Icon size={14} />
                <span>{section.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="settings-grid">
          <section className="settings-card settings-card-anchor" id="settings-section-general">
            <div className="settings-card-heading">
              <Settings2 size={16} />
              <span>{copy.settingsDialog.general.title}</span>
            </div>

            <SettingsField title={copy.settingsDialog.general.language}>
              <SettingsSelect
                value={settings.ui.locale}
                options={languageOptions}
                onChange={(locale) => {
                  patchSettingsSection('ui', { locale })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.general.startupPanel}
              description={copy.settingsDialog.general.startupPanelDescription}
            >
              <SettingsSelect
                value={settings.ui.defaultPanelMode}
                options={startupPanelOptions}
                onChange={(defaultPanelMode) => {
                  patchSettingsSection('ui', { defaultPanelMode })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.general.defaultFolder}
              description={copy.settingsDialog.general.selectFolderDialogTitle}
            >
              <SettingsFolderPicker
                pathValue={settings.media.defaultOpenDirectoryPath}
                fallback="—"
                selectLabel={copy.settingsDialog.general.selectFolder}
                clearLabel={copy.settingsDialog.general.clearFolder}
                onPickFolder={onPickDefaultFolder}
                onChange={(defaultOpenDirectoryPath) => {
                  patchSettingsSection('media', { defaultOpenDirectoryPath })
                }}
              />
            </SettingsField>

            <SettingsToggle
              title={copy.settingsDialog.general.autoLoadDirectoryFiles}
              description={copy.settingsDialog.general.autoLoadDirectoryFilesDescription}
              checked={settings.media.autoLoadSameDirectoryFiles}
              onChange={(autoLoadSameDirectoryFiles) => {
                patchSettingsSection('media', { autoLoadSameDirectoryFiles })
              }}
            />
          </section>

          <section className="settings-card settings-card-anchor" id="settings-section-interface">
            <div className="settings-card-heading">
              <LayoutGrid size={16} />
              <span>{copy.settingsDialog.interface.title}</span>
            </div>

            <SettingsToggle
              title={copy.settingsDialog.interface.rememberVolume}
              description={copy.settingsDialog.interface.rememberVolumeDescription}
              checked={settings.playback.rememberVolume}
              onChange={(rememberVolume) => {
                patchSettingsSection('playback', { rememberVolume })
              }}
            />

            <SettingsToggle
              title={copy.settingsDialog.interface.rememberPlaybackRate}
              description={copy.settingsDialog.interface.rememberPlaybackRateDescription}
              checked={settings.playback.rememberPlaybackRate}
              onChange={(rememberPlaybackRate) => {
                patchSettingsSection('playback', { rememberPlaybackRate })
              }}
            />

            <SettingsToggle
              title={copy.settingsDialog.interface.rememberProgress}
              description={copy.settingsDialog.interface.rememberProgressDescription}
              checked={settings.playback.rememberProgress}
              onChange={(rememberProgress) => {
                patchSettingsSection('playback', { rememberProgress })
              }}
            />

            <SettingsToggle
              title={copy.settingsDialog.interface.singleClickPause}
              description={copy.settingsDialog.interface.singleClickPauseDescription}
              checked={settings.playback.singleClickPause}
              onChange={(singleClickPause) => {
                patchSettingsSection('playback', { singleClickPause })
              }}
            />

            <SettingsToggle
              title={copy.settingsDialog.interface.pauseWhenMinimized}
              description={copy.settingsDialog.interface.pauseWhenMinimizedDescription}
              checked={settings.playback.pauseWhenMinimized}
              onChange={(pauseWhenMinimized) => {
                patchSettingsSection('playback', { pauseWhenMinimized })
              }}
            />

            <SettingsField
              title={copy.settingsDialog.interface.autoHideControlDeck}
              description={copy.settingsDialog.interface.autoHideControlDeckDescription}
            >
              <SettingsToggleValueRow
                checked={settings.playback.autoHideControlDeck}
                onCheckedChange={(autoHideControlDeck) => {
                  patchSettingsSection('playback', { autoHideControlDeck })
                }}
                value={settings.playback.controlDeckAutoHideSeconds}
                onValueChange={(controlDeckAutoHideSeconds) => {
                  patchSettingsSection('playback', { controlDeckAutoHideSeconds })
                }}
                min={1}
                max={60}
                checkboxAriaLabel={copy.settingsDialog.interface.autoHideControlDeck}
                valueAriaLabel={copy.settingsDialog.interface.autoHideControlDeckDelay}
                unit={copy.settingsDialog.interface.secondsUnit}
              />
            </SettingsField>

            <SettingsToggle
              title={copy.settingsDialog.interface.showTotalPlaybackTime}
              description={copy.settingsDialog.interface.showTotalPlaybackTimeDescription}
              checked={settings.playback.showTotalPlaybackTime}
              onChange={(showTotalPlaybackTime) => {
                patchSettingsSection('playback', { showTotalPlaybackTime })
              }}
            />
          </section>

          <section className="settings-card settings-card-anchor" id="settings-section-video">
            <div className="settings-card-heading">
              <Clapperboard size={16} />
              <span>{copy.settingsDialog.video.title}</span>
            </div>

            <SettingsField
              title={copy.settingsDialog.video.seekStepSeconds}
              description={copy.settingsDialog.video.seekStepSecondsDescription}
            >
              <SettingsNumberInput
                min={1}
                max={120}
                value={settings.playback.seekStepSeconds}
                onChange={(seekStepSeconds) => {
                  patchSettingsSection('playback', { seekStepSeconds })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.video.holdRightArrowSpeed}
              description={copy.settingsDialog.video.holdRightArrowSpeedDescription}
            >
              <SettingsNumberInput
                min={1}
                max={16}
                value={settings.playback.holdRightArrowSpeed}
                onChange={(holdRightArrowSpeed) => {
                  patchSettingsSection('playback', { holdRightArrowSpeed })
                }}
              />
            </SettingsField>

            <div className="settings-note-box">
              <span className="settings-note-title">{copy.settingsDialog.video.hardwareAcceleration}</span>
              <p>{copy.settingsDialog.video.hardwareAccelerationDescription}</p>
            </div>
          </section>

          <section className="settings-card settings-card-anchor" id="settings-section-subtitles">
            <div className="settings-card-heading">
              <Captions size={16} />
              <span>{copy.settingsDialog.subtitles.title}</span>
            </div>

            <SettingsField
              title={copy.settingsDialog.subtitles.subtitleLanguage}
              description={copy.settingsDialog.subtitles.subtitleLanguageDescription}
            >
              <SettingsSelect
                value={settings.asr.defaultSubtitleLanguage}
                options={subtitleLanguageOptions}
                onChange={(defaultSubtitleLanguage) => {
                  patchSettingsSection('asr', { defaultSubtitleLanguage })
                }}
              />
            </SettingsField>

            <SettingsToggle
              title={copy.settingsDialog.subtitles.autoLoadCachedSubtitles}
              description={copy.settingsDialog.subtitles.autoLoadCachedSubtitlesDescription}
              checked={settings.asr.autoLoadCachedSubtitles}
              onChange={(autoLoadCachedSubtitles) => {
                patchSettingsSection('asr', { autoLoadCachedSubtitles })
              }}
            />

            <SettingsField
              title={copy.settingsDialog.subtitles.modelSource}
              description={copy.settingsDialog.subtitles.modelSourceDescription}
            >
              <SettingsSelect
                value={settings.asr.preferredModelSourceId}
                options={modelSourceOptions}
                onChange={(preferredModelSourceId) => {
                  patchSettingsSection('asr', { preferredModelSourceId })
                }}
              />
            </SettingsField>

            {asrStatus ? (
              <div className="settings-note-box">
                <span className="settings-note-title">{copy.asrPanel.engineStatus}</span>
                <p>{asrStatus.message}</p>
              </div>
            ) : null}
          </section>

          <section className="settings-card settings-card-anchor settings-card-wide" id="settings-section-capture">
            <div className="settings-card-heading">
              <Camera size={16} />
              <span>{copy.settingsDialog.capture.title}</span>
            </div>

            <SettingsField
              title={copy.settingsDialog.capture.saveFolder}
              description={copy.settingsDialog.capture.saveFolderDescription}
            >
              <SettingsFolderPicker
                pathValue={settings.capture.saveDirectoryPath}
                fallback="—"
                selectLabel={copy.settingsDialog.capture.selectFolder}
                onPickFolder={onPickCaptureFolder}
                onChange={(saveDirectoryPath) => {
                  patchSettingsSection('capture', { saveDirectoryPath })
                }}
              />
            </SettingsField>

            <SettingsToggle
              title={copy.settingsDialog.capture.copyToClipboard}
              description={copy.settingsDialog.capture.copyToClipboardDescription}
              checked={settings.capture.copyToClipboard}
              onChange={(copyToClipboard) => {
                patchSettingsSection('capture', { copyToClipboard })
              }}
            />

            <SettingsField
              title={copy.settingsDialog.capture.imageFormat}
              description={copy.settingsDialog.capture.imageFormatDescription}
            >
              <SettingsSelect
                value={settings.capture.imageFormat}
                options={captureImageFormatOptions}
                onChange={(imageFormat) => {
                  patchSettingsSection('capture', { imageFormat })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.capture.fileNaming}
              description={copy.settingsDialog.capture.fileNamingDescription}
            >
              <SettingsSelect
                value={settings.capture.fileNaming}
                options={captureFileNamingOptions}
                onChange={(fileNaming) => {
                  patchSettingsSection('capture', { fileNaming })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.capture.gifFrameRate}
              description={copy.settingsDialog.capture.gifFrameRateDescription}
            >
              <SettingsNumberInput
                min={1}
                max={60}
                value={settings.capture.gifFrameRate}
                onChange={(gifFrameRate) => {
                  patchSettingsSection('capture', { gifFrameRate })
                }}
              />
            </SettingsField>

            <SettingsField
              title={copy.settingsDialog.capture.gifResolution}
              description={copy.settingsDialog.capture.gifResolutionDescription}
            >
              <SettingsSelect
                value={settings.capture.gifResolution}
                options={captureGifResolutionOptions}
                onChange={(gifResolution) => {
                  patchSettingsSection('capture', { gifResolution })
                }}
              />
            </SettingsField>

            <div className="settings-card-note">{copy.settingsDialog.capture.description}</div>
          </section>

          <section className="settings-card settings-card-anchor settings-card-wide" id="settings-section-shortcuts">
            <div className="settings-card-heading">
              <Keyboard size={16} />
              <span>{copy.settingsDialog.shortcuts.title}</span>
            </div>
            <div className="settings-note-box">
              <span className="settings-note-title">{copy.settingsDialog.shortcuts.title}</span>
              <p>{copy.settingsDialog.shortcuts.description}</p>
            </div>
            <div className="settings-card-note">{copy.settingsDialog.comingSoon}</div>
          </section>
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
