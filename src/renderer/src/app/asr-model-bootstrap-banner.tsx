import { Download, RotateCcw } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AsrModelBootstrapState } from '../../../shared/asr-model-bootstrap'

export function AsrModelBootstrapBanner(props: {
  copy: LocaleCopy
  state: AsrModelBootstrapState | null
  onOpenAsrPanel: () => void
}): React.ReactElement {
  const { copy, state, onOpenAsrPanel } = props
  if (!state || (state.status !== 'downloading' && state.status !== 'error' && state.status !== 'blocked')) {
    return <div className="app-update-banner-slot" aria-hidden="true" />
  }

  if (state.status === 'downloading') {
    const progress = state.progress?.percent == null ? null : Math.round(state.progress.percent * 100)
    return (
      <div className="app-update-banner app-update-banner-downloading" role="status" aria-live="polite">
        <Download size={15} />
        <span>{state.progress?.message ?? copy.modelView.downloading(state.sourceName)}</span>
        {progress !== null ? <div className="app-update-progress" aria-label={`${progress}%`}><i style={{ width: `${progress}%` }} /></div> : null}
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
