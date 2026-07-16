import { Camera, Captions, Clapperboard, Keyboard, LayoutGrid, Settings2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField, SettingsFolderPicker, SettingsSelect, SettingsToggle, SettingsToggleValueRow } from '../settings-controls'
import { SettingsNumberInput, SettingsTextInput, SettingsTextarea } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

export function CaptureSettingsSection(props: SettingsSectionProps): ReactElement {
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
    className={`settings-card settings-card-anchor settings-card-wide ${activeSectionId === 'capture' ? '' : 'is-hidden'}`}
    id="settings-section-capture"
    role="tabpanel"
    aria-labelledby="settings-tab-capture"
    aria-hidden={activeSectionId !== 'capture'}
  >
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
  )
}
