import { Download, PackageCheck, X } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AppUpdateState } from '../../../shared/app-update-types'
import { SettingsToggle } from './settings-controls'

type AppUpdateDialogProps = {
  copy: LocaleCopy
  state: AppUpdateState
  autoUpdate: boolean
  onAutoUpdateChange: (enabled: boolean) => void
  onDownload: () => Promise<AppUpdateState>
  onInstall: () => Promise<void>
  onDismiss: () => void
  onSkip: () => void
}

function isPromptState(status: AppUpdateState['status']): boolean {
  return status === 'available' || status === 'downloading' || status === 'downloaded' || status === 'installing'
}

export function AppUpdateDialog({
  copy,
  state,
  autoUpdate,
  onAutoUpdateChange,
  onDownload,
  onInstall,
  onDismiss,
  onSkip
}: AppUpdateDialogProps): ReactElement | null {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const version = state.version ?? ''
  const isDownloading = state.status === 'downloading'
  const isDownloaded = state.status === 'downloaded'
  const isInstalling = state.status === 'installing'
  const progress = state.progress ? Math.round(state.progress.percent) : null

  useEffect(() => {
    setDismissedVersion(null)
  }, [version])

  useEffect(() => {
    if (!isPromptState(state.status)) return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDismissedVersion(version)
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss, state.status, version])

  if (!version || !isPromptState(state.status) || dismissedVersion === version) return null

  const handleDismiss = (): void => {
    setDismissedVersion(version)
    onDismiss()
  }
  const handlePrimary = (): void => {
    if (state.status === 'available') {
      void onDownload().catch(() => undefined)
    } else if (isDownloaded) {
      void onInstall().catch(() => undefined)
    }
  }
  const description = isDownloaded
    ? copy.update.ready(version)
    : isInstalling
      ? copy.update.installing(version)
      : isDownloading
        ? copy.update.downloading(version, progress)
        : copy.update.availableDescription(version, state.currentVersion)

  return (
    <div className="app-update-dialog-backdrop" role="presentation">
      <section className="app-update-dialog" role="dialog" aria-labelledby="app-update-dialog-title" aria-describedby="app-update-dialog-description" data-testid="app-update-dialog">
        <div className="app-update-dialog-header">
          <div className="app-update-dialog-icon" aria-hidden="true">
            {isDownloaded ? <PackageCheck size={23} /> : <Download size={23} />}
          </div>
          <div className="app-update-dialog-heading">
            <h2 id="app-update-dialog-title">{copy.update.availableTitle}</h2>
            <p id="app-update-dialog-description" aria-live="polite" aria-atomic="true">{description}</p>
          </div>
          <button className="mini-tool-button app-update-dialog-close" type="button" onClick={handleDismiss} title={copy.update.remindLater} aria-label={copy.update.remindLater}>
            <X size={14} />
          </button>
        </div>

        {isDownloading && progress !== null ? <div className="app-update-dialog-progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label={copy.update.downloadProgress(progress)}><i style={{ width: `${progress}%` }} /></div> : null}

        <SettingsToggle title={copy.update.autoInstall} checked={autoUpdate} onChange={onAutoUpdateChange} />

        <div className="app-update-dialog-actions">
          <button className="settings-secondary-button" type="button" onClick={onSkip} disabled={state.status !== 'available'}>{copy.update.skipVersion}</button>
          <button className="settings-secondary-button" type="button" onClick={handleDismiss} disabled={isInstalling}>{copy.update.remindLater}</button>
          <button className="settings-primary-button app-update-dialog-primary" type="button" onClick={handlePrimary} disabled={isDownloading || isInstalling}>
            {isInstalling ? copy.update.installingAction : isDownloading ? copy.update.downloadingAction : isDownloaded ? copy.update.restartAction : copy.update.installAction}
          </button>
        </div>
      </section>
    </div>
  )
}
