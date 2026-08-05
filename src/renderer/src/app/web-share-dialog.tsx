import { Copy, ExternalLink, FolderPlus, Globe2, LoaderCircle, RefreshCw, Square, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { WebShareStatus } from '../../../shared/web-types'
import { createWebShareQrCode } from './web-share-qr'

type Props = {
  copy: LocaleCopy
  status: WebShareStatus
  error: string | null
  notice: string | null
  playlistCount: number
  directoryPaths: string[]
  onStart: () => void
  onStop: () => void
  onRefresh: () => void
  onAddDirectory: () => void
  onRemoveDirectory: (directoryPath: string) => void
  allowRemoteControl: boolean
  onToggleRemoteControl: (enabled: boolean) => void
  onCopy: (url: string) => void
  onOpen: (url: string) => Promise<boolean>
  onClose: () => void
}

export function WebShareDialog({ copy, status, error, notice, playlistCount, directoryPaths, onStart, onStop, onRefresh, onAddDirectory, onRemoveDirectory, allowRemoteControl, onToggleRemoteControl, onCopy, onOpen, onClose }: Props): React.ReactElement {
  const [qrCodeUrls, setQrCodeUrls] = useState<Record<string, string>>({})
  const [openingUrl, setOpeningUrl] = useState<string | null>(null)
  const hasShareSource = playlistCount > 0 || directoryPaths.length > 0

  const openUrl = async (url: string): Promise<void> => {
    setOpeningUrl(url)
    try {
      await onOpen(url)
    } finally {
      setOpeningUrl(null)
    }
  }

  useEffect(() => {
    const urls = [...status.urls]
    if (urls.length === 0) {
      setQrCodeUrls({})
      return
    }

    let active = true
    setQrCodeUrls({})
    void Promise.all(urls.map(async (url): Promise<readonly [string, string] | null> => {
      try {
        return [url, await createWebShareQrCode(url)]
      } catch {
        return null
      }
    })).then((entries) => {
      if (!active) return
      setQrCodeUrls(Object.fromEntries(entries.filter((entry): entry is readonly [string, string] => entry !== null)))
    })

    return () => { active = false }
  }, [status.urls])

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
    <section className="web-share-dialog" role="dialog" aria-modal="true" aria-labelledby="web-share-title" tabIndex={-1}>
      <div className="web-share-header">
        <div className="web-share-title"><span className="web-share-icon"><Globe2 size={18} /></span><div><h2 id="web-share-title">{copy.webShare.title}</h2><p>{copy.webShare.description}</p></div></div>
        <button className="mini-tool-button" type="button" onClick={onClose} title={copy.webShare.close} aria-label={copy.webShare.close}><X size={14} /></button>
      </div>
      <div className="web-share-directories">
        <div className="web-share-section-heading"><strong>{copy.webShare.sharedDirectories}</strong><button className="settings-secondary-button" type="button" onClick={onAddDirectory}><FolderPlus size={14} />{copy.webShare.chooseFolder}</button></div>
        {directoryPaths.length > 0 ? <div className="web-share-directory-list">{directoryPaths.map((directoryPath) => <div className="web-share-directory" key={directoryPath}><span title={directoryPath}>{directoryPath}</span><button className="mini-tool-button" type="button" onClick={() => onRemoveDirectory(directoryPath)} title={copy.webShare.removeFolder} aria-label={copy.webShare.removeFolder}><X size={13} /></button></div>)}</div> : <span className="web-share-empty-directory">{copy.webShare.noDirectory}</span>}
      </div>
      <div className={`web-share-status ${status.running ? 'is-running' : 'is-stopped'}`}><span className="web-share-status-dot" /><strong>{status.running ? copy.webShare.running : copy.webShare.stopped}</strong><span>{status.running ? <>{copy.webShare.sharedCount(status.sharedFileCount)} · {copy.webShare.sharedDirectoryCount(status.sharedDirectoryCount)}</> : copy.webShare.emptyUrl}</span></div>
      {status.urls.length > 0 ? <div className="web-share-url-box"><div className="web-share-url-heading"><span>{copy.webShare.accessUrl}</span><small>{copy.webShare.defaultBrowserHint}</small></div><div className="web-share-url-list">{status.urls.map((url) => <div className="web-share-url-item" key={url}><div className="web-share-url-preview"><div className="web-share-qr" aria-label={copy.webShare.qrCodeAlt}>{qrCodeUrls[url] ? <img src={qrCodeUrls[url]} alt={copy.webShare.qrCodeAlt} /> : <span className="web-share-qr-pending" aria-hidden="true" />}</div><div className="web-share-url-copy"><code>{url}</code><span className="web-share-url-hint">{copy.webShare.scanQrCode}</span></div></div><div className="web-share-url-actions"><button className="settings-secondary-button" type="button" onClick={() => onCopy(url)} aria-label={`${copy.webShare.copyUrl}: ${url}`}><Copy size={14} />{copy.webShare.copyUrl}</button><button className="settings-secondary-button" type="button" onClick={() => { void openUrl(url) }} disabled={openingUrl !== null} aria-label={`${copy.webShare.openUrl}: ${url}`}>{openingUrl === url ? <LoaderCircle size={14} className="web-share-button-spinner" /> : <ExternalLink size={14} />}{openingUrl === url ? copy.webShare.openingUrl : copy.webShare.openUrl}</button></div></div>)}</div></div> : null}
      {!status.running && !hasShareSource ? <div className="web-share-warning" role="status">{copy.webShare.noFiles}</div> : null}
      {error ? <div className="web-share-error" role="alert">{error}</div> : null}
      {notice ? <div className="web-share-notice" role="status">{notice}</div> : null}
      <label className="web-share-remote-toggle"><input type="checkbox" checked={allowRemoteControl} onChange={(event) => onToggleRemoteControl(event.currentTarget.checked)} /><span><strong>允许远程控制 Desktop 播放</strong><small>开启后，已获得访问地址的手机或电脑可以播放、暂停、切换视频和拖动进度。</small></span></label>
      <div className="web-share-note">{copy.webShare.securityNote}</div>
      <div className="web-share-footer"><button className="settings-secondary-button" type="button" onClick={onClose}>{copy.webShare.close}</button>{status.running ? <><button className="settings-secondary-button" type="button" onClick={onRefresh}><RefreshCw size={14} />{copy.webShare.refresh}</button><button className="settings-danger-button" type="button" onClick={onStop}><Square size={14} />{copy.webShare.stop}</button></> : <button className="settings-primary-button" type="button" onClick={onStart} disabled={!hasShareSource}><Globe2 size={14} />{copy.webShare.start}</button>}</div>
    </section>
  </div>
}
