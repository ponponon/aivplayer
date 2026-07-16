import { Sparkles } from 'lucide-react'
import type { ReactElement } from 'react'
import { SettingsField } from './settings-controls'
import { SettingsTextInput, SettingsTextarea } from './settings-inputs'
import type { SettingsSectionProps } from './settings-section-types'

export function TranslationServiceSettings({
  copy,
  settings,
  patchSettingsSection,
  translationServiceTestMessage,
  isTestingTranslationService,
  translationServiceSourceLanguageLabel,
  translationServiceTargetLanguageLabel,
  translationServiceEndpointSummary,
  onTestTranslationService,
  asrStatus
}: SettingsSectionProps): ReactElement {
  return (
    <>
      <div className="settings-note-box">
        <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServiceTitle}</span>
        <p>{copy.settingsDialog.subtitles.translationServiceDescription}</p>
      </div>
      <SettingsField title={copy.settingsDialog.subtitles.translationBaseUrl} description={copy.settingsDialog.subtitles.translationBaseUrlDescription}>
        <SettingsTextInput
          value={settings.asr.translationBaseUrl ?? ''}
          autoComplete="off"
          onChange={(translationBaseUrl) => patchSettingsSection('asr', { translationBaseUrl: translationBaseUrl.trim() || null })}
        />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.translationModel} description={copy.settingsDialog.subtitles.translationModelDescription}>
        <SettingsTextInput
          value={settings.asr.translationModel ?? ''}
          autoComplete="off"
          onChange={(translationModel) => patchSettingsSection('asr', { translationModel: translationModel.trim() || null })}
        />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.translationApiKey} description={copy.settingsDialog.subtitles.translationApiKeyDescription}>
        <SettingsTextInput
          type="password"
          value={settings.asr.translationApiKey ?? ''}
          autoComplete="new-password"
          onChange={(translationApiKey) => patchSettingsSection('asr', { translationApiKey: translationApiKey.trim() || null })}
        />
      </SettingsField>
      <SettingsField title={copy.settingsDialog.subtitles.translationGlossary} description={copy.settingsDialog.subtitles.translationGlossaryDescription}>
        <SettingsTextarea
          value={settings.asr.translationGlossary ?? ''}
          ariaLabel={copy.settingsDialog.subtitles.translationGlossary}
          onChange={(translationGlossary) => patchSettingsSection('asr', { translationGlossary: translationGlossary.trim() || null })}
        />
      </SettingsField>
      <SettingsField
        title={copy.settingsDialog.subtitles.translationServiceCheckTitle}
        description={copy.settingsDialog.subtitles.translationServiceCheckDescription}
      >
        <div className="settings-inline-row">
          <button className="settings-secondary-button" type="button" onClick={onTestTranslationService} disabled={isTestingTranslationService}>
            <Sparkles size={14} />
            {isTestingTranslationService ? copy.settingsDialog.subtitles.translationServiceChecking : copy.settingsDialog.subtitles.translationServiceCheck}
          </button>
        </div>
        {translationServiceTestMessage ? (
          <div className={`asr-result ${translationServiceTestMessage.success ? 'success' : 'failed'}`}>{translationServiceTestMessage.message}</div>
        ) : null}
        {translationServiceTestMessage ? (
          <div className="settings-note-box">
            <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServiceResultTitle}</span>
            <div className="settings-meta-grid">
              <div className="settings-meta-item"><span>{copy.asrPanel.translationLanguagePair}</span><strong>{translationServiceSourceLanguageLabel} → {translationServiceTargetLanguageLabel}</strong></div>
              <div className="settings-meta-item"><span>{copy.asrPanel.translationModel}</span><strong>{translationServiceTestMessage.translationModel ?? '—'}</strong></div>
              <div className="settings-meta-item"><span>{copy.settingsDialog.subtitles.translationBaseUrl}</span><strong>{translationServiceEndpointSummary}</strong></div>
            </div>
            {translationServiceTestMessage.success && translationServiceTestMessage.sampleSourceText && translationServiceTestMessage.sampleTranslatedText ? (
              <>
                <span className="settings-note-title">{copy.settingsDialog.subtitles.translationServicePreviewTitle}</span>
                <p>{translationServiceTestMessage.sampleSourceText} → {translationServiceTestMessage.sampleTranslatedText}</p>
              </>
            ) : null}
          </div>
        ) : null}
      </SettingsField>
      {asrStatus ? (
        <div className="settings-note-box">
          <span className="settings-note-title">{copy.asrPanel.engineStatus}</span>
          <p>{asrStatus.message}</p>
        </div>
      ) : null}
    </>
  )
}
