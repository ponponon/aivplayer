import { Camera, Captions, Clapperboard, Keyboard, LayoutGrid, Settings2 } from 'lucide-react'
import type { AppSettingsSectionId } from '../../../../shared/app-settings'
import type { ReactElement } from 'react'
import { SettingsField, SettingsFolderPicker, SettingsSelect, SettingsToggle, SettingsToggleValueRow } from '../settings-controls'
import { SettingsNumberInput, SettingsTextInput, SettingsTextarea } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

export function GeneralSettingsSection(props: SettingsSectionProps): ReactElement {
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
    className={`settings-card settings-card-anchor ${activeSectionId === 'general' ? '' : 'is-hidden'}`}
    id="settings-section-general"
    role="tabpanel"
    aria-labelledby="settings-tab-general"
    aria-hidden={activeSectionId !== 'general'}
  >
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
  )
}
