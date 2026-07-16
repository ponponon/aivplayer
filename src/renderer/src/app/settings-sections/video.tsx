import { Camera, Captions, Clapperboard, Keyboard, LayoutGrid, Settings2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField, SettingsFolderPicker, SettingsSelect, SettingsToggle, SettingsToggleValueRow } from '../settings-controls'
import { SettingsNumberInput, SettingsTextInput, SettingsTextarea } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

export function VideoSettingsSection(props: SettingsSectionProps): ReactElement {
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
    className={`settings-card settings-card-anchor ${activeSectionId === 'video' ? '' : 'is-hidden'}`}
    id="settings-section-video"
    role="tabpanel"
    aria-labelledby="settings-tab-video"
    aria-hidden={activeSectionId !== 'video'}
  >
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
  )
}
