import { Check, Download, Info, RefreshCw, RotateCcw } from 'lucide-react'
import type { ReactElement } from 'react'
import type { AppUpdateState } from '../../../../shared/app-update-types'
import type { LocaleCopy } from '../../../../shared/i18n'
import { SettingsField } from '../settings-controls'
import type { SettingsTabId } from '../settings-dialog-model'

export type AboutSettingsSectionProps = {
  copy: LocaleCopy
  activeSectionId: SettingsTabId
  updateState: AppUpdateState
  onCheckForUpdate: () => void
  onInstallUpdate: () => void
}

function getUpdateStatusLabel(copy: LocaleCopy, state: AppUpdateState): string {
  switch (state.status) {
    case 'disabled':
      return copy.settingsDialog.about.updateDisabled
    case 'checking':
      return copy.settingsDialog.about.checking
    case 'up-to-date':
      return copy.settingsDialog.about.upToDate
    case 'downloading':
      return copy.update.downloading(state.version ?? '—', state.progress ? Math.round(state.progress.percent) : null)
    case 'downloaded':
      return copy.update.ready(state.version ?? '—')
    case 'installing':
      return copy.update.installing(state.version ?? '—')
    case 'error':
      return copy.update.error(state.error ?? '')
    case 'idle':
    default:
      return copy.settingsDialog.about.notChecked
  }
}

export function AboutSettingsSection({ copy, activeSectionId, updateState, onCheckForUpdate, onInstallUpdate }: AboutSettingsSectionProps): ReactElement {
  const isChecking = updateState.status === 'checking'
  const isBusy = isChecking || updateState.status === 'downloading' || updateState.status === 'installing'
  const canInstall = updateState.status === 'downloaded' || updateState.status === 'installing'
  const progress = updateState.progress ? Math.round(updateState.progress.percent) : null

  return (
    <section
      className={`settings-card settings-card-anchor settings-about-card ${activeSectionId === 'about' ? '' : 'is-hidden'}`}
      id="settings-section-about"
      role="tabpanel"
      aria-labelledby="settings-tab-about"
      aria-hidden={activeSectionId !== 'about'}
    >
      <div className="settings-card-heading">
        <Info size={16} />
        <span>{copy.settingsDialog.about.title}</span>
      </div>

      <SettingsField title={copy.settingsDialog.about.versionLabel}>
        <div className="settings-about-value">{updateState.currentVersion || '—'}</div>
      </SettingsField>

      <SettingsField title={copy.settingsDialog.about.licenseLabel}>
        <div className="settings-about-value">{copy.aboutDialog.license}</div>
      </SettingsField>

      <SettingsField wide title={copy.settingsDialog.about.projectLabel}>
        <div className="settings-about-value settings-about-project">{copy.aboutDialog.website}</div>
      </SettingsField>

      <SettingsField
        wide
        title={copy.settingsDialog.about.updateTitle}
        description={copy.settingsDialog.about.updateDescription}
      >
        <div className="settings-about-update" role="status" aria-live="polite">
          <div className={`settings-about-update-status is-${updateState.status}`}>
            {updateState.status === 'up-to-date' ? <Check size={14} /> : null}
            {updateState.status === 'downloading' ? <Download size={14} /> : null}
            {updateState.status === 'downloaded' || updateState.status === 'installing' ? <RotateCcw size={14} /> : null}
            <span>{getUpdateStatusLabel(copy, updateState)}</span>
          </div>
          {updateState.status === 'downloading' && progress !== null ? (
            <div className="settings-about-progress" aria-label={`${progress}%`}>
              <i style={{ width: `${progress}%` }} />
            </div>
          ) : null}
          <div className="settings-about-update-actions">
            <button
              className="settings-secondary-button"
              type="button"
              onClick={onCheckForUpdate}
              disabled={updateState.status === 'disabled' || isBusy || canInstall}
            >
              <RefreshCw size={14} />
              {isChecking ? copy.settingsDialog.about.checking : copy.settingsDialog.about.checkForUpdates}
            </button>
            {canInstall ? (
              <button
                className="asr-action-button primary"
                type="button"
                onClick={onInstallUpdate}
                disabled={updateState.status === 'installing'}
              >
                <RotateCcw size={14} />
                {updateState.status === 'installing' ? copy.update.installingAction : copy.update.restartAction}
              </button>
            ) : null}
          </div>
        </div>
      </SettingsField>
    </section>
  )
}
