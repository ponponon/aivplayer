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
import { useEffect, useLayoutEffect, useRef, useState, type ReactElement } from 'react'
import type {
  AppPanelModePreference,
  AppSettings,
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
  onChange: (updater: (current: AppSettings) => AppSettings) => void
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

export function SettingsDialog(props: SettingsDialogProps): ReactElement {
  const {
    copy,
    settings,
    asrStatus,
    initialSectionId = 'general',
    onChange,
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

  const patchSettings = (updater: (current: AppSettings) => AppSettings): void => {
    onChange(updater)
  }

  const selectSection = (sectionId: AppSettingsSectionId): void => {
    if (activeSectionIdRef.current === sectionId) {
      return
    }

    activeSectionIdRef.current = sectionId
    setActiveSectionId(sectionId)
    patchSettings((current) => ({
      ...current,
      ui: {
        ...current.ui,
        lastSettingsSectionId: sectionId
      }
    }))
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

  const languageOptions = Object.entries(copy.languageOptions) as Array<
    [AppLocale, (typeof copy.languageOptions)[AppLocale]]
  >

  const subtitleLanguageOptions = Object.entries(copy.subtitleLanguageOptions) as Array<
    [SubtitleLanguageId, (typeof copy.subtitleLanguageOptions)[SubtitleLanguageId]]
  >

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

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.general.language}</strong>
              </div>
              <select
                className="settings-select"
                value={settings.ui.locale}
                onChange={(event) => {
                  const locale = event.currentTarget.value as AppLocale
                  patchSettings((current) => ({
                    ...current,
                    ui: {
                      ...current.ui,
                      locale
                    }
                  }))
                }}
              >
                {languageOptions.map(([locale, option]) => (
                  <option key={locale} value={locale}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.general.startupPanel}</strong>
                <small>{copy.settingsDialog.general.startupPanelDescription}</small>
              </div>
              <select
                className="settings-select"
                value={settings.ui.defaultPanelMode}
                onChange={(event) => {
                  const defaultPanelMode = event.currentTarget.value as AppPanelModePreference
                  patchSettings((current) => ({
                    ...current,
                    ui: {
                      ...current.ui,
                      defaultPanelMode
                    }
                  }))
                }}
              >
                {startupPanelOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.general.defaultFolder}</strong>
                <small>{copy.settingsDialog.general.selectFolderDialogTitle}</small>
              </div>
              <div className="settings-inline-row">
                <div className="settings-path-value" title={settings.media.defaultOpenDirectoryPath ?? ''}>
                  {formatPathLabel(settings.media.defaultOpenDirectoryPath, '—')}
                </div>
                <button
                  className="settings-secondary-button"
                  type="button"
                  onClick={async () => {
                    const folderPath = await onPickDefaultFolder()
                    if (!folderPath) {
                      return
                    }

                    patchSettings((current) => ({
                      ...current,
                      media: {
                        ...current.media,
                        defaultOpenDirectoryPath: folderPath
                      }
                    }))
                  }}
                >
                  <FolderOpen size={14} />
                  {copy.settingsDialog.general.selectFolder}
                </button>
                <button
                  className="settings-secondary-button"
                  type="button"
                  onClick={() =>
                    patchSettings((current) => ({
                      ...current,
                      media: {
                        ...current.media,
                        defaultOpenDirectoryPath: null
                      }
                    }))
                  }
                  disabled={!settings.media.defaultOpenDirectoryPath}
                >
                  {copy.settingsDialog.general.clearFolder}
                </button>
              </div>
            </div>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.media.autoLoadSameDirectoryFiles}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    media: {
                      ...current.media,
                      autoLoadSameDirectoryFiles: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.general.autoLoadDirectoryFiles}</strong>
                <small>{copy.settingsDialog.general.autoLoadDirectoryFilesDescription}</small>
              </span>
            </label>
          </section>

          <section className="settings-card settings-card-anchor" id="settings-section-interface">
            <div className="settings-card-heading">
              <LayoutGrid size={16} />
              <span>{copy.settingsDialog.interface.title}</span>
            </div>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.rememberVolume}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      rememberVolume: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.interface.rememberVolume}</strong>
                <small>{copy.settingsDialog.interface.rememberVolumeDescription}</small>
              </span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.rememberPlaybackRate}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      rememberPlaybackRate: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.interface.rememberPlaybackRate}</strong>
                <small>{copy.settingsDialog.interface.rememberPlaybackRateDescription}</small>
              </span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.rememberProgress}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      rememberProgress: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.interface.rememberProgress}</strong>
                <small>{copy.settingsDialog.interface.rememberProgressDescription}</small>
              </span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.singleClickPause}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      singleClickPause: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.interface.singleClickPause}</strong>
                <small>{copy.settingsDialog.interface.singleClickPauseDescription}</small>
              </span>
            </label>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.pauseWhenMinimized}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      pauseWhenMinimized: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.interface.pauseWhenMinimized}</strong>
                <small>{copy.settingsDialog.interface.pauseWhenMinimizedDescription}</small>
              </span>
            </label>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.interface.autoHideControlDeck}</strong>
                <small>{copy.settingsDialog.interface.autoHideControlDeckDescription}</small>
              </div>
              <div className="settings-inline-row">
                <input
                  className="settings-checkbox"
                  type="checkbox"
                  checked={settings.playback.autoHideControlDeck}
                  onChange={(event) =>
                    patchSettings((current) => ({
                      ...current,
                      playback: {
                        ...current.playback,
                        autoHideControlDeck: event.currentTarget.checked
                      }
                    }))
                  }
                  aria-label={copy.settingsDialog.interface.autoHideControlDeck}
                />
                <input
                  className="settings-number settings-number-compact"
                  type="number"
                  min={1}
                  max={60}
                  step={1}
                  value={settings.playback.controlDeckAutoHideSeconds}
                  disabled={!settings.playback.autoHideControlDeck}
                  onChange={(event) => {
                    const controlDeckAutoHideSeconds = Number(event.currentTarget.value)
                    patchSettings((current) => ({
                      ...current,
                      playback: {
                        ...current.playback,
                        controlDeckAutoHideSeconds: Number.isFinite(controlDeckAutoHideSeconds)
                          ? controlDeckAutoHideSeconds
                          : current.playback.controlDeckAutoHideSeconds
                      }
                    }))
                  }}
                  aria-label={copy.settingsDialog.interface.autoHideControlDeckDelay}
                />
                <span className="settings-inline-unit">{copy.settingsDialog.interface.secondsUnit}</span>
              </div>
            </div>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.playback.showTotalPlaybackTime}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      showTotalPlaybackTime: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.interface.showTotalPlaybackTime}</strong>
                <small>{copy.settingsDialog.interface.showTotalPlaybackTimeDescription}</small>
              </span>
            </label>
          </section>

          <section className="settings-card settings-card-anchor" id="settings-section-video">
            <div className="settings-card-heading">
              <Clapperboard size={16} />
              <span>{copy.settingsDialog.video.title}</span>
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.video.seekStepSeconds}</strong>
                <small>{copy.settingsDialog.video.seekStepSecondsDescription}</small>
              </div>
              <input
                className="settings-number"
                type="number"
                min={1}
                max={120}
                step={1}
                value={settings.playback.seekStepSeconds}
                onChange={(event) => {
                  const seekStepSeconds = Number(event.currentTarget.value)
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      seekStepSeconds: Number.isFinite(seekStepSeconds) ? seekStepSeconds : current.playback.seekStepSeconds
                    }
                  }))
                }}
              />
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.video.holdRightArrowSpeed}</strong>
                <small>{copy.settingsDialog.video.holdRightArrowSpeedDescription}</small>
              </div>
              <input
                className="settings-number"
                type="number"
                min={1}
                max={16}
                step={1}
                value={settings.playback.holdRightArrowSpeed}
                onChange={(event) => {
                  const holdRightArrowSpeed = Number(event.currentTarget.value)
                  patchSettings((current) => ({
                    ...current,
                    playback: {
                      ...current.playback,
                      holdRightArrowSpeed: Number.isFinite(holdRightArrowSpeed)
                        ? holdRightArrowSpeed
                        : current.playback.holdRightArrowSpeed
                    }
                  }))
                }}
              />
            </div>

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

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.subtitles.subtitleLanguage}</strong>
                <small>{copy.settingsDialog.subtitles.subtitleLanguageDescription}</small>
              </div>
              <select
                className="settings-select"
                value={settings.asr.defaultSubtitleLanguage}
                onChange={(event) => {
                  const defaultSubtitleLanguage = event.currentTarget.value as SubtitleLanguageId
                  patchSettings((current) => ({
                    ...current,
                    asr: {
                      ...current.asr,
                      defaultSubtitleLanguage
                    }
                  }))
                }}
              >
                {subtitleLanguageOptions.map(([languageId, option]) => (
                  <option key={languageId} value={languageId}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.asr.autoLoadCachedSubtitles}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    asr: {
                      ...current.asr,
                      autoLoadCachedSubtitles: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.subtitles.autoLoadCachedSubtitles}</strong>
                <small>{copy.settingsDialog.subtitles.autoLoadCachedSubtitlesDescription}</small>
              </span>
            </label>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.subtitles.modelSource}</strong>
                <small>{copy.settingsDialog.subtitles.modelSourceDescription}</small>
              </div>
              <select
                className="settings-select"
                value={settings.asr.preferredModelSourceId}
                onChange={(event) => {
                  const preferredModelSourceId = event.currentTarget.value as AsrModelSourceId
                  patchSettings((current) => ({
                    ...current,
                    asr: {
                      ...current.asr,
                      preferredModelSourceId
                    }
                  }))
                }}
              >
                {modelSourceOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

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

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.capture.saveFolder}</strong>
                <small>{copy.settingsDialog.capture.saveFolderDescription}</small>
              </div>
              <div className="settings-inline-row">
                <div className="settings-path-value" title={settings.capture.saveDirectoryPath ?? ''}>
                  {formatPathLabel(settings.capture.saveDirectoryPath, '—')}
                </div>
                <button
                  className="settings-secondary-button"
                  type="button"
                  onClick={async () => {
                    const folderPath = await onPickCaptureFolder()
                    if (!folderPath) {
                      return
                    }

                    patchSettings((current) => ({
                      ...current,
                      capture: {
                        ...current.capture,
                        saveDirectoryPath: folderPath
                      }
                    }))
                  }}
                >
                  <FolderOpen size={14} />
                  {copy.settingsDialog.capture.selectFolder}
                </button>
              </div>
            </div>

            <label className="setting-toggle">
              <input
                type="checkbox"
                checked={settings.capture.copyToClipboard}
                onChange={(event) =>
                  patchSettings((current) => ({
                    ...current,
                    capture: {
                      ...current.capture,
                      copyToClipboard: event.currentTarget.checked
                    }
                  }))
                }
              />
              <span>
                <strong>{copy.settingsDialog.capture.copyToClipboard}</strong>
                <small>{copy.settingsDialog.capture.copyToClipboardDescription}</small>
              </span>
            </label>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.capture.imageFormat}</strong>
                <small>{copy.settingsDialog.capture.imageFormatDescription}</small>
              </div>
              <select
                className="settings-select"
                value={settings.capture.imageFormat}
                onChange={(event) => {
                  const imageFormat = event.currentTarget.value as CaptureImageFormat
                  patchSettings((current) => ({
                    ...current,
                    capture: {
                      ...current.capture,
                      imageFormat
                    }
                  }))
                }}
              >
                {captureImageFormatOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.capture.fileNaming}</strong>
                <small>{copy.settingsDialog.capture.fileNamingDescription}</small>
              </div>
              <select
                className="settings-select"
                value={settings.capture.fileNaming}
                onChange={(event) => {
                  const fileNaming = event.currentTarget.value as CaptureFileNamingMode
                  patchSettings((current) => ({
                    ...current,
                    capture: {
                      ...current.capture,
                      fileNaming
                    }
                  }))
                }}
              >
                {captureFileNamingOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.capture.gifFrameRate}</strong>
                <small>{copy.settingsDialog.capture.gifFrameRateDescription}</small>
              </div>
              <input
                className="settings-number"
                type="number"
                min={1}
                max={60}
                step={1}
                value={settings.capture.gifFrameRate}
                onChange={(event) => {
                  const gifFrameRate = Number(event.currentTarget.value)
                  patchSettings((current) => ({
                    ...current,
                    capture: {
                      ...current.capture,
                      gifFrameRate: Number.isFinite(gifFrameRate) ? gifFrameRate : current.capture.gifFrameRate
                    }
                  }))
                }}
              />
            </div>

            <div className="settings-field">
              <div className="settings-field-copy">
                <strong>{copy.settingsDialog.capture.gifResolution}</strong>
                <small>{copy.settingsDialog.capture.gifResolutionDescription}</small>
              </div>
              <select
                className="settings-select"
                value={settings.capture.gifResolution}
                onChange={(event) => {
                  const gifResolution = event.currentTarget.value as CaptureGifResolution
                  patchSettings((current) => ({
                    ...current,
                    capture: {
                      ...current.capture,
                      gifResolution
                    }
                  }))
                }}
              >
                {captureGifResolutionOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

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
