import { AlertTriangle } from 'lucide-react'
import type { ReactElement } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'

export type GpuRestartDialogProps = {
  copy: LocaleCopy
  isRestarting: boolean
  onCancel: () => void
  onConfirm: () => void
}

export function GpuRestartDialog({ copy, isRestarting, onCancel, onConfirm }: GpuRestartDialogProps): ReactElement {
  return (
    <div className="modal-backdrop" role="presentation" style={{ zIndex: 1000 }}>
      <section className="settings-dialog" style={{ maxWidth: 400 }} role="alertdialog" aria-modal="true">
        <div className="settings-dialog-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
            <h2>{copy.settingsDialog.gpuRestartTitle}</h2>
          </div>
        </div>
        <div style={{ padding: '16px 24px' }}>
          <p>{copy.settingsDialog.gpuRestartMessage}</p>
        </div>
        <div className="settings-footer" style={{ justifyContent: 'flex-end' }}>
          <div className="settings-footer-actions">
            <button className="settings-secondary-button" type="button" onClick={onCancel} disabled={isRestarting}>
              {copy.settingsDialog.gpuRestartCancel}
            </button>
            <button className="asr-action-button" type="button" onClick={onConfirm} disabled={isRestarting}>
              {copy.settingsDialog.gpuRestartConfirm}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
