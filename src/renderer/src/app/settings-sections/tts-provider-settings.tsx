import { RotateCcw, Search } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import { SettingsField } from '../settings-controls'
import { SettingsTextInput } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'
import type { MediaEvidenceCapabilities } from '../../../../shared/evidence-task-types'

export function TtsProviderSettings({ copy, settings, patchSettingsSection }: SettingsSectionProps): ReactElement {
  const subtitleCopy = copy.settingsDialog.subtitles
  const [capability, setCapability] = useState<MediaEvidenceCapabilities['tts'] | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [checkError, setCheckError] = useState<string | null>(null)

  const updateTts = (patch: Partial<typeof settings.tts>): void => {
    setCapability(null)
    setCheckError(null)
    patchSettingsSection('tts', patch)
  }

  const checkProvider = async (): Promise<void> => {
    setIsChecking(true)
    setCheckError(null)
    try {
      const nextCapabilities = await window.aiv.getMediaEvidenceCapabilities()
      setCapability(nextCapabilities.tts)
    } catch (error) {
      setCapability(null)
      setCheckError(error instanceof Error ? error.message : String(error))
    } finally {
      setIsChecking(false)
    }
  }

  const statusText = isChecking
    ? subtitleCopy.ttsChecking
    : checkError
      ? subtitleCopy.ttsCheckError
      : capability
        ? capability.available
          ? subtitleCopy.ttsReady
          : subtitleCopy.ttsUnavailable
        : subtitleCopy.ttsNotChecked

  return (
    <div className="settings-card-wide settings-tts-provider">
      <div className="settings-note-box">
        <span className="settings-note-title">{subtitleCopy.ttsProviderTitle}</span>
        <p>{subtitleCopy.ttsProviderDescription}</p>
      </div>
      <SettingsField title={subtitleCopy.ttsExecutablePath} description={subtitleCopy.ttsExecutablePathDescription} wide>
        <SettingsTextInput
          value={settings.tts.executablePath ?? ''}
          placeholder={subtitleCopy.ttsExecutablePathPlaceholder}
          ariaLabel={subtitleCopy.ttsExecutablePath}
          dataTestId="settings-tts-executable-path"
          onChange={(value) => updateTts({ executablePath: value.trim() || null })}
        />
      </SettingsField>
      <SettingsField title={subtitleCopy.ttsVoice} description={subtitleCopy.ttsVoiceDescription} wide>
        <SettingsTextInput
          value={settings.tts.voice ?? ''}
          placeholder={subtitleCopy.ttsVoicePlaceholder}
          ariaLabel={subtitleCopy.ttsVoice}
          dataTestId="settings-tts-voice"
          onChange={(value) => updateTts({ voice: value.trim() || null })}
        />
      </SettingsField>
      <SettingsField title={subtitleCopy.ttsCheckTitle} description={subtitleCopy.ttsCheckDescription} wide>
        <div className="settings-inline-row">
          <button className="settings-secondary-button" type="button" onClick={() => void checkProvider()} disabled={isChecking} data-testid="settings-tts-check-button">
            <Search size={14} />
            {isChecking ? subtitleCopy.ttsChecking : subtitleCopy.ttsCheck}
          </button>
          <button
            className="settings-secondary-button"
            type="button"
            onClick={() => {
              setCapability(null)
              setCheckError(null)
            }}
            disabled={isChecking || (!capability && !checkError)}
          >
            <RotateCcw size={14} />
            {subtitleCopy.ttsReset}
          </button>
        </div>
        <p className={`settings-card-note settings-tts-status ${capability?.available ? 'is-success' : capability ? 'is-error' : ''}`} data-testid="settings-tts-status">
          {statusText}
          {capability?.command ? ` · ${capability.command}` : ''}
          {checkError ? ` · ${checkError}` : capability && !capability.available ? ` · ${capability.message}` : ''}
        </p>
      </SettingsField>
    </div>
  )
}
