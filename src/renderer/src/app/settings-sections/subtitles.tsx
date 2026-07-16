import { Captions } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField, SettingsSelect, SettingsToggle } from '../settings-controls'
import { SettingsNumberInput } from '../settings-inputs'
import { clampSubtitleFontSize } from '../subtitle-display-settings'
import { TranslationServiceSettings } from '../translation-service-settings'
import type { SettingsSectionProps } from '../settings-section-types'

export function SubtitlesSettingsSection(props: SettingsSectionProps): ReactElement {
  const { copy, settings, patchSettingsSection, activeSectionId, subtitleLanguageOptions, targetLanguageOptions,
    subtitleLineHeightOptions, subtitleDisplayModeOptions, modelSourceOptions } = props

  return (
    <section
      className={`settings-card settings-card-anchor ${activeSectionId === 'subtitles' ? '' : 'is-hidden'}`}
      id="settings-section-subtitles"
      role="tabpanel"
      aria-labelledby="settings-tab-subtitles"
      aria-hidden={activeSectionId !== 'subtitles'}
    >
      <div className="settings-card-heading">
        <Captions size={16} />
        <span>{copy.settingsDialog.subtitles.title}</span>
      </div>
      <div className="settings-note-box">
        <span className="settings-note-title">{copy.settingsDialog.subtitles.displayHeading}</span>
        <p>{copy.settingsDialog.subtitles.fontSizeDescription}</p>
      </div>
      <SettingsField title={copy.settingsDialog.subtitles.fontSize} description={copy.settingsDialog.subtitles.fontSizeDescription}>
        <div className="settings-inline-row">
          <SettingsNumberInput
            min={12}
            max={28}
            value={settings.subtitles.fontSizePx}
            compact
            ariaLabel={copy.settingsDialog.subtitles.fontSize}
            onChange={(fontSizePx) => patchSettingsSection('subtitles', { fontSizePx: clampSubtitleFontSize(fontSizePx) })}
          />
          <span className="settings-inline-unit">px</span>
        </div>
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.lineHeight} description={copy.settingsDialog.subtitles.lineHeightDescription}>
        <SettingsSelect value={settings.subtitles.lineHeight} options={subtitleLineHeightOptions} onChange={(lineHeight) => patchSettingsSection('subtitles', { lineHeight })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.displayMode} description={copy.settingsDialog.subtitles.displayModeDescription}>
        <SettingsSelect value={settings.subtitles.displayMode} options={subtitleDisplayModeOptions} onChange={(displayMode) => patchSettingsSection('subtitles', { displayMode })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.targetLanguage} description={copy.settingsDialog.subtitles.targetLanguageDescription}>
        <SettingsSelect value={settings.subtitles.targetLanguage} options={targetLanguageOptions} onChange={(targetLanguage) => patchSettingsSection('subtitles', { targetLanguage })} />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.subtitleLanguage} description={copy.settingsDialog.subtitles.subtitleLanguageDescription}>
        <SettingsSelect value={settings.asr.defaultSubtitleLanguage} options={subtitleLanguageOptions} onChange={(defaultSubtitleLanguage) => patchSettingsSection('asr', { defaultSubtitleLanguage })} />
      </SettingsField>
      <SettingsToggle
        title={copy.settingsDialog.subtitles.autoLoadCachedSubtitles}
        description={copy.settingsDialog.subtitles.autoLoadCachedSubtitlesDescription}
        checked={settings.asr.autoLoadCachedSubtitles}
        onChange={(autoLoadCachedSubtitles) => patchSettingsSection('asr', { autoLoadCachedSubtitles })}
      />
      <SettingsField title={copy.settingsDialog.subtitles.modelSource} description={copy.settingsDialog.subtitles.modelSourceDescription}>
        <SettingsSelect value={settings.asr.preferredModelSourceId} options={modelSourceOptions} onChange={(preferredModelSourceId) => patchSettingsSection('asr', { preferredModelSourceId })} />
      </SettingsField>
      <TranslationServiceSettings {...props} />
    </section>
  )
}
