import { Download, RotateCcw } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { AppUpdateState } from '../../../shared/app-update-types'

export function AppUpdateBanner(props: {
  copy: LocaleCopy
  state: AppUpdateState
  onCheck: () => void
  onInstall: () => void
}): React.ReactElement {
  const { copy, state, onCheck, onInstall } = props
  if (state.status === 'error') {
    return (
      <div className="app-update-banner app-update-banner-error" role="status" aria-live="polite">
        <span>{copy.update.error(state.error ?? '')}</span>
        <button className="app-update-install-button" type="button" onClick={onCheck}>{copy.update.retryAction}</button>
      </div>
    )
  }
  if (state.status !== 'downloading' && state.status !== 'downloaded' && state.status !== 'installing') return <div className="app-update-banner-slot" aria-hidden="true" />

  const progress = state.progress ? Math.round(state.progress.percent) : null
  const version = state.version ?? '—'
  if (state.status === 'downloading') {
    return (
      <div className="app-update-banner app-update-banner-downloading" role="status" aria-live="polite">
        <Download size={15} />
        <span>{copy.update.downloading(version, progress)}</span>
        {progress !== null ? <div className="app-update-progress" aria-label={`${progress}%`}><i style={{ width: `${progress}%` }} /></div> : null}
      </div>
    )
  }

  return (
    <div className="app-update-banner app-update-banner-ready" role="status" aria-live="polite">
      <div className="app-update-banner-copy">
        <RotateCcw size={15} />
        <span>{state.status === 'installing' ? copy.update.installing(version) : copy.update.ready(version)}</span>
      </div>
      <button className="app-update-install-button" type="button" onClick={onInstall} disabled={state.status === 'installing'}>
        {state.status === 'installing' ? copy.update.installingAction : copy.update.restartAction}
      </button>
    </div>
  )
}
