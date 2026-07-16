import { Camera, Captions, Clapperboard, Keyboard, LayoutGrid, Settings2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField, SettingsFolderPicker, SettingsSelect, SettingsToggle, SettingsToggleValueRow } from '../settings-controls'
import { SettingsNumberInput, SettingsTextInput, SettingsTextarea } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

export function InterfaceSettingsSection(props: SettingsSectionProps): ReactElement {
  const {
    copy,
    settings,
    patchSettingsSection,
    activeSectionId,
    languageOptions,
    subtitleLanguageOptions,
    targetLanguageOptions,
    subtitleLineHeightOptions,
    subtitleDisplayModeOptions,
    startupPanelOptions,
    modelSourceOptions,
    captureImageFormatOptions,
    captureFileNamingOptions,
    captureGifResolutionOptions,
    asrStatus,
    translationServiceTestMessage,
    isTestingTranslationService,
    translationServiceSourceLanguageLabel,
    translationServiceTargetLanguageLabel,
    translationServiceEndpointSummary,
    onPickDefaultFolder,
    onPickCaptureFolder,
    onTestTranslationService
  } = props

  return (
  <section
    className={`settings-card settings-card-anchor ${activeSectionId === 'interface' ? '' : 'is-hidden'}`}
    id="settings-section-interface"
    role="tabpanel"
    aria-labelledby="settings-tab-interface"
    aria-hidden={activeSectionId !== 'interface'}
  >
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
  )
}
