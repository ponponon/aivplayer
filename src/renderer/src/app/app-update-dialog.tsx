import { Download, X } from 'lucide-react'
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
  onDismiss: () => void
  onSkip: () => void
}

export function AppUpdateDialog({
  copy,
  state,
  autoUpdate,
  onAutoUpdateChange,
  onDownload,
  onDismiss,
  onSkip
}: AppUpdateDialogProps): ReactElement | null {
  const [dismissedVersion, setDismissedVersion] = useState<string | null>(null)
  const version = state.version ?? ''

  useEffect(() => {
    setDismissedVersion(null)
  }, [version])

  useEffect(() => {
    if (state.status !== 'available') return
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setDismissedVersion(version)
        onDismiss()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onDismiss, state.status, version])

  if (!version || state.status !== 'available' || dismissedVersion === version) return null

  const handleDismiss = (): void => {
    setDismissedVersion(version)
    onDismiss()
  }
  const handlePrimary = (): void => {
    void onDownload().catch(() => undefined)
  }

  return (
    <section className="app-update-dialog" role="dialog" aria-labelledby="app-update-dialog-title" aria-describedby="app-update-dialog-description" data-testid="app-update-dialog">
        <div className="app-update-dialog-header">
          <div className="app-update-dialog-icon" aria-hidden="true">
            <Download size={23} />
          </div>
          <div className="app-update-dialog-heading">
            <h2 id="app-update-dialog-title">{copy.update.availableTitle}</h2>
            <p id="app-update-dialog-description" aria-live="polite" aria-atomic="true">{copy.update.availableDescription(version, state.currentVersion)}</p>
          </div>
          <button className="mini-tool-button app-update-dialog-close" type="button" onClick={handleDismiss} title={copy.update.remindLater} aria-label={copy.update.remindLater}>
            <X size={14} />
          </button>
        </div>

        <SettingsToggle title={copy.update.autoInstall} checked={autoUpdate} onChange={onAutoUpdateChange} />

        <div className="app-update-dialog-actions">
          <button className="settings-secondary-button" type="button" onClick={onSkip}>{copy.update.skipVersion}</button>
          <button className="settings-secondary-button" type="button" onClick={handleDismiss}>{copy.update.remindLater}</button>
          <button className="settings-primary-button app-update-dialog-primary" type="button" onClick={handlePrimary}>{copy.update.downloadAction}</button>
        </div>
    </section>
  )
}
