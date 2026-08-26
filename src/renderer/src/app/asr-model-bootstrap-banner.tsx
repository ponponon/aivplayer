import { Download, RotateCcw } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AsrModelBootstrapState } from '../../../shared/asr-model-bootstrap'
import { AsrModelDownloadProgress } from './asr-model-download-progress'

export function AsrModelBootstrapBanner(props: {
  copy: LocaleCopy
  state: AsrModelBootstrapState | null
  expectedSizeBytes?: number
  onOpenAsrPanel: () => void
}): React.ReactElement {
  const { copy, state, expectedSizeBytes, onOpenAsrPanel } = props
  if (!state || (state.status !== 'downloading' && state.status !== 'error' && state.status !== 'blocked')) {
    return <div className="app-update-banner-slot" aria-hidden="true" />
  }

  if (state.status === 'downloading') {
    return (
      <div className="app-update-banner app-update-banner-downloading asr-model-bootstrap-banner" role="status" aria-live="polite">
        <Download size={15} aria-hidden="true" />
        <div className="asr-model-bootstrap-content">
          <div className="asr-model-bootstrap-heading">
            <strong>{state.progress?.message ?? copy.modelView.downloading(state.sourceName)}</strong>
            <span>{state.progress?.sourceName ?? state.sourceName}</span>
          </div>
          <AsrModelDownloadProgress copy={copy} progress={state.progress} expectedSizeBytes={expectedSizeBytes} />
        </div>
      </div>
    )
  }

  return (
    <div className="app-update-banner app-update-banner-error" role="status" aria-live="polite">
      <span>{state.error ?? state.message}</span>
      <button className="app-update-install-button" type="button" onClick={onOpenAsrPanel}>
        <RotateCcw size={13} />
        {copy.settingsDialog.openAsrPanel}
      </button>
    </div>
  )
}
