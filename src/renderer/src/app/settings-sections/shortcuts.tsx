import { Camera, Captions, Clapperboard, Keyboard, LayoutGrid, Settings2 } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField, SettingsFolderPicker, SettingsSelect, SettingsToggle, SettingsToggleValueRow } from '../settings-controls'
import { SettingsNumberInput, SettingsTextInput, SettingsTextarea } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

export function ShortcutsSettingsSection(props: SettingsSectionProps): ReactElement {
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
    className={`settings-card settings-card-anchor settings-card-wide ${activeSectionId === 'shortcuts' ? '' : 'is-hidden'}`}
    id="settings-section-shortcuts"
    role="tabpanel"
    aria-labelledby="settings-tab-shortcuts"
    aria-hidden={activeSectionId !== 'shortcuts'}
  >
    <div className="settings-card-heading">
      <Keyboard size={16} />
      <span>{copy.settingsDialog.shortcuts.title}</span>
    </div>
    <p className="settings-card-note">{copy.settingsDialog.shortcuts.description}</p>
    <div className="settings-shortcuts">
      {Object.entries(copy.settingsDialog.shortcuts.items).map(([shortcutId, shortcut]) => (
        <div className="settings-shortcut" key={shortcutId}>
          <kbd>{shortcut.keys}</kbd>
          <div className="settings-shortcut-copy">
            <strong>{shortcut.label}</strong>
            <small>{shortcut.description}</small>
          </div>
        </div>
      ))}
    </div>
  </section>
  )
}
