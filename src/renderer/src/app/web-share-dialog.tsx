import { Copy, ExternalLink, Globe2, Square, X } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { WebShareStatus } from '../../../shared/web-types'

type Props = {
  copy: LocaleCopy
  status: WebShareStatus
  error: string | null
  notice: string | null
  playlistCount: number
  onStart: () => void
  onStop: () => void
  onCopy: (url: string) => void
  onClose: () => void
}

export function WebShareDialog({ copy, status, error, notice, playlistCount, onStart, onStop, onCopy, onClose }: Props): React.ReactElement {
  const url = status.urls[0] ?? null
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="web-share-dialog" role="dialog" aria-modal="true" aria-labelledby="web-share-title" tabIndex={-1}>
      <div className="web-share-header">
        <div className="web-share-title"><span className="web-share-icon"><Globe2 size={18} /></span><div><h2 id="web-share-title">{copy.webShare.title}</h2><p>{copy.webShare.description}</p></div></div>
        <button className="mini-tool-button" type="button" onClick={onClose} title={copy.webShare.close} aria-label={copy.webShare.close}><X size={14} /></button>
      </div>
      <div className={`web-share-status ${status.running ? 'is-running' : 'is-stopped'}`}><span className="web-share-status-dot" /><strong>{status.running ? copy.webShare.running : copy.webShare.stopped}</strong><span>{status.running ? copy.webShare.sharedCount(status.sharedFileCount) : copy.webShare.emptyUrl}</span></div>
      {url ? <div className="web-share-url-box"><span>{copy.webShare.accessUrl}</span><code>{url}</code><div className="web-share-url-actions"><button className="settings-secondary-button" type="button" onClick={() => onCopy(url)}><Copy size={14} />{copy.webShare.copyUrl}</button><button className="settings-secondary-button" type="button" onClick={() => window.open(url, '_blank')}><ExternalLink size={14} />{copy.webShare.openUrl}</button></div></div> : null}
      {!status.running && playlistCount === 0 ? <div className="web-share-warning" role="status">{copy.webShare.noFiles}</div> : null}
      {error ? <div className="web-share-error" role="alert">{error}</div> : null}
      {notice ? <div className="web-share-notice" role="status">{notice}</div> : null}
      <div className="web-share-note">{copy.webShare.securityNote}</div>
      <div className="web-share-footer"><button className="settings-secondary-button" type="button" onClick={onClose}>{copy.webShare.close}</button>{status.running ? <button className="settings-danger-button" type="button" onClick={onStop}><Square size={14} />{copy.webShare.stop}</button> : <button className="settings-primary-button" type="button" onClick={onStart} disabled={playlistCount === 0}><Globe2 size={14} />{copy.webShare.start}</button>}</div>
    </section>
  </div>
}
