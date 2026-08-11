import { AudioLines, Clapperboard, RefreshCcw, ScanSearch } from 'lucide-react'
import { useCallback, useEffect, useState, type ReactElement } from 'react'
import type { SpeakerDiarizationModelStatus, VisionObjectDetectionModelStatus } from '../../../../shared/media-types'
import { SettingsField, SettingsFolderPicker, SettingsSelect, SettingsToggle, SettingsToggleValueRow } from '../settings-controls'
import { SettingsNumberInput, SettingsTextInput, SettingsTextarea } from '../settings-inputs'
import type { SettingsSectionProps } from '../settings-section-types'

type SpeakerDiarizationCopy = {
  title: string
  description: string
  providerLabel: string
  platformLabel: string
  modelLabel: string
  modelReady: string
  modelMissing: string
  modelDirectoryLabel: string
  modelDirectoryDefault: string
  selectModelFolder: string
  clearModelFolder: string
  checking: string
  refresh: string
  refreshing: string
}

type VisionObjectDetectionCopy = {
  title: string
  description: string
  providerLabel: string
  platformLabel: string
  modelLabel: string
  modelReady: string
  modelMissing: string
  modelDirectoryLabel: string
  modelDirectoryDefault: string
  selectModelFolder: string
  clearModelFolder: string
  checking: string
  refresh: string
  refreshing: string
}

function SpeakerDiarizationStatusField({
  copy,
  modelDirectory,
  onPickModelFolder,
  onModelDirectoryChange
}: {
  copy: SpeakerDiarizationCopy
  modelDirectory: string | null
  onPickModelFolder: () => Promise<string | null>
  onModelDirectoryChange: (pathValue: string | null) => void
}): ReactElement {
  const [status, setStatus] = useState<SpeakerDiarizationModelStatus | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      setStatus(await window.aiv.getSpeakerDiarizationStatus())
    } catch {
      setStatus(null)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [modelDirectory, refresh])

  return (
    <div className="settings-speaker-status" data-testid="settings-speaker-diarization">
      <div className="settings-meta-grid">
        <div className="settings-meta-item">
          <span>{copy.providerLabel}</span>
          <strong>{status?.providerId ?? '—'}</strong>
        </div>
        <div className="settings-meta-item">
          <span>{copy.platformLabel}</span>
          <strong>{status?.platform.platform ?? '—'}</strong>
        </div>
        <div className="settings-meta-item">
          <span>{copy.modelLabel}</span>
          <strong>{status ? (status.modelFilesAvailable ? copy.modelReady : copy.modelMissing) : copy.checking}</strong>
        </div>
      </div>
      <p className={`settings-card-note settings-speaker-message ${status?.available ? 'is-success' : status ? 'is-error' : ''}`}>
        {status?.message ?? copy.checking}
      </p>
      <div className="settings-inline-row">
        <div className="settings-path-value" title={status?.modelDirectory ?? ''}>{status?.modelDirectory ?? '—'}</div>
        <button className="settings-secondary-button" type="button" onClick={() => void refresh()} disabled={isRefreshing} data-testid="settings-speaker-diarization-refresh">
          <RefreshCcw size={14} />
          {isRefreshing ? copy.refreshing : copy.refresh}
        </button>
      </div>
      <div className="settings-speaker-model-directory">
        <span className="settings-speaker-model-directory-label">{copy.modelDirectoryLabel}</span>
        <SettingsFolderPicker
          pathValue={modelDirectory}
          fallback={copy.modelDirectoryDefault}
          selectLabel={copy.selectModelFolder}
          clearLabel={copy.clearModelFolder}
          onPickFolder={onPickModelFolder}
          onChange={onModelDirectoryChange}
        />
      </div>
    </div>
  )
}

function VisionObjectDetectionStatusField({
  copy,
  modelDirectory,
  onPickModelFolder,
  onModelDirectoryChange
}: {
  copy: VisionObjectDetectionCopy
  modelDirectory: string | null
  onPickModelFolder: () => Promise<string | null>
  onModelDirectoryChange: (pathValue: string | null) => void
}): ReactElement {
  const [status, setStatus] = useState<VisionObjectDetectionModelStatus | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)

  const refresh = useCallback(async (): Promise<void> => {
    setIsRefreshing(true)
    try {
      setStatus(await window.aiv.getVisionObjectDetectionStatus())
    } catch {
      setStatus(null)
    } finally {
      setIsRefreshing(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [modelDirectory, refresh])

  return (
    <div className="settings-vision-object-detection-status" data-testid="settings-vision-object-detection">
      <div className="settings-meta-grid">
        <div className="settings-meta-item">
          <span>{copy.providerLabel}</span>
          <strong>{status?.providerId ?? '—'}</strong>
        </div>
        <div className="settings-meta-item">
          <span>{copy.platformLabel}</span>
          <strong>{status?.platform.platform ?? '—'}</strong>
        </div>
        <div className="settings-meta-item">
          <span>{copy.modelLabel}</span>
          <strong>{status ? (status.modelFilesAvailable ? copy.modelReady : copy.modelMissing) : copy.checking}</strong>
        </div>
      </div>
      <p className={`settings-card-note settings-vision-object-detection-message ${status?.available ? 'is-success' : status ? 'is-error' : ''}`}>
        {status?.message ?? copy.checking}
      </p>
      <div className="settings-inline-row">
        <div className="settings-path-value" title={status?.modelDirectory ?? ''}>{status?.modelDirectory ?? '—'}</div>
        <button className="settings-secondary-button" type="button" onClick={() => void refresh()} disabled={isRefreshing} data-testid="settings-vision-object-detection-refresh">
          <RefreshCcw size={14} />
          {isRefreshing ? copy.refreshing : copy.refresh}
        </button>
      </div>
      <div className="settings-vision-object-detection-model-directory">
        <span className="settings-vision-object-detection-model-directory-label">{copy.modelDirectoryLabel}</span>
        <SettingsFolderPicker
          pathValue={modelDirectory}
          fallback={copy.modelDirectoryDefault}
          selectLabel={copy.selectModelFolder}
          clearLabel={copy.clearModelFolder}
          onPickFolder={onPickModelFolder}
          onChange={onModelDirectoryChange}
        />
      </div>
    </div>
  )
}

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
    onTestTranslationService,
    onGpuAccelerationChange
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

    <SettingsField
      wide
      title={copy.settingsDialog.video.gpuAcceleration}
      description={copy.settingsDialog.video.gpuAccelerationDescription}
    >
      <SettingsToggle
        title=""
        checked={settings.playback.gpuAcceleration}
        onChange={(gpuAcceleration) => {
          onGpuAccelerationChange?.(gpuAcceleration)
        }}
      />
    </SettingsField>

    <SettingsField
      wide
      title={<span className="settings-field-title-with-icon"><AudioLines size={14} />{copy.settingsDialog.video.speakerDiarization.title}</span>}
      description={copy.settingsDialog.video.speakerDiarization.description}
    >
      <SpeakerDiarizationStatusField
        copy={copy.settingsDialog.video.speakerDiarization}
        modelDirectory={settings.vision.speakerModelDirectory}
        onPickModelFolder={() => window.aiv.openFolderPicker({
          title: copy.settingsDialog.video.speakerDiarization.selectModelFolder,
          defaultPath: settings.vision.speakerModelDirectory
        })}
        onModelDirectoryChange={(speakerModelDirectory) => {
          patchSettingsSection('vision', { speakerModelDirectory })
        }}
      />
    </SettingsField>

    <SettingsField
      wide
      title={<span className="settings-field-title-with-icon"><ScanSearch size={14} />{copy.settingsDialog.video.objectDetection.title}</span>}
      description={copy.settingsDialog.video.objectDetection.description}
    >
      <VisionObjectDetectionStatusField
        copy={copy.settingsDialog.video.objectDetection}
        modelDirectory={settings.vision.objectDetectionModelDirectory}
        onPickModelFolder={() => window.aiv.openFolderPicker({
          title: copy.settingsDialog.video.objectDetection.selectModelFolder,
          defaultPath: settings.vision.objectDetectionModelDirectory
        })}
        onModelDirectoryChange={(objectDetectionModelDirectory) => {
          patchSettingsSection('vision', { objectDetectionModelDirectory })
        }}
      />
    </SettingsField>
  </section>
  )
}
