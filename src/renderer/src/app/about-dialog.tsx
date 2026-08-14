import { CircleQuestionMark, ExternalLink, X } from 'lucide-react'
import { useEffect, useRef, useState, type ReactElement } from 'react'
import { OFFICIAL_WEBSITE_URL } from '../../../shared/app-links'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'

type AboutDialogProps = {
  copy: LocaleCopy
  onClose: () => void
}

export function AboutDialog({ copy, onClose }: AboutDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const [version, setVersion] = useState('—')

  useModalFocusTrap(true, dialogRef, '.about-dialog-close')

  useEffect(() => {
    let active = true
    void window.aiv.getAppVersion().then((nextVersion) => {
      if (active) setVersion(nextVersion)
    })
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      active = false
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="about-dialog" tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="about-dialog-title" aria-describedby="about-dialog-description">
        <div className="about-dialog-header">
          <div>
            <span className="panel-kicker">{copy.aboutDialog.kicker}</span>
            <h2 id="about-dialog-title">{copy.aboutDialog.title}</h2>
          </div>
          <button className="mini-tool-button about-dialog-close" type="button" onClick={onClose} title={copy.aboutDialog.close} aria-label={copy.aboutDialog.close}>
            <X size={14} />
          </button>
        </div>
        <div className="about-dialog-brand" aria-hidden="true">
          <span className="about-dialog-mark">A</span>
          <CircleQuestionMark size={18} />
        </div>
        <p id="about-dialog-description" className="about-dialog-description">{copy.aboutDialog.description}</p>
        <div className="about-dialog-meta">
          <div><span>{copy.aboutDialog.versionLabel}</span><strong>{version}</strong></div>
          <div><span>{copy.aboutDialog.licenseLabel}</span><strong>{copy.aboutDialog.license}</strong></div>
          <div className="about-dialog-meta-wide"><span>{copy.aboutDialog.websiteLabel}</span><strong>{copy.aboutDialog.website}</strong></div>
        </div>
        <div className="about-dialog-footer">
          <div className="about-dialog-footer-actions">
            <span>{copy.aboutDialog.footer}</span>
            <button className="settings-secondary-button" type="button" onClick={() => { void window.aiv.openExternalUrl(OFFICIAL_WEBSITE_URL) }}>
              <ExternalLink size={14} />
              {copy.aboutDialog.openOfficialWebsite}
            </button>
          </div>
          <button className="settings-secondary-button" type="button" onClick={onClose}>{copy.aboutDialog.close}</button>
        </div>
      </section>
    </div>
  )
}
