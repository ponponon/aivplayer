import { ExternalLink, GitBranch, Globe2, HeartHandshake, X } from 'lucide-react'
import { useEffect, useRef, type ReactElement } from 'react'
import { SUPPORT_PROMPT_DISMISSED_STORAGE_KEY, SUPPORT_PROMPT_LINKS } from '../../../shared/support-prompt'
import type { LocaleCopy } from '../../../shared/i18n'
import { useModalFocusTrap } from './use-modal-focus-trap'

type SupportDialogProps = {
  copy: LocaleCopy
  onClose: () => void
}

function markSupportPromptDismissed(): void {
  try {
    window.localStorage.setItem(SUPPORT_PROMPT_DISMISSED_STORAGE_KEY, '1')
  } catch {
    // Storage can be unavailable; the dialog can still be closed for this session.
  }
}

export function SupportDialog({ copy, onClose }: SupportDialogProps): ReactElement {
  const dialogRef = useRef<HTMLElement | null>(null)
  const supportCopy = copy.supportDialog

  useModalFocusTrap(true, dialogRef, '.support-dialog-close')

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      markSupportPromptDismissed()
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  const closeDialog = (): void => {
    markSupportPromptDismissed()
    onClose()
  }

  return (
    <div className="modal-backdrop support-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && closeDialog()}>
      <section
        ref={dialogRef}
        className="support-dialog"
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="support-dialog-title"
        aria-describedby="support-dialog-description"
        data-testid="support-dialog"
      >
        <div className="support-dialog-header">
          <div className="support-dialog-heading">
            <div className="support-dialog-icon" aria-hidden="true">
              <HeartHandshake size={21} />
            </div>
            <div>
              <span className="panel-kicker">{supportCopy.kicker}</span>
              <h2 id="support-dialog-title">{supportCopy.title}</h2>
            </div>
          </div>
          <button className="mini-tool-button support-dialog-close" type="button" onClick={closeDialog} title={supportCopy.close} aria-label={supportCopy.close}>
            <X size={14} />
          </button>
        </div>

        <div className="support-dialog-copy">
          <p id="support-dialog-description">{supportCopy.description}</p>
          <p>{supportCopy.message}</p>
        </div>

        <div className="support-dialog-links" aria-label={supportCopy.linksLabel}>
          {SUPPORT_PROMPT_LINKS.map((link) => {
            const linkCopy = supportCopy.links[link.id]
            const Icon = link.id === 'github' ? GitBranch : Globe2
            return (
              <button className={`support-dialog-link support-dialog-link-${link.id}`} type="button" key={link.id} onClick={() => { void window.aiv.openExternalUrl(link.url) }}>
                <span className="support-dialog-link-icon" aria-hidden="true"><Icon size={20} /></span>
                <span className="support-dialog-link-copy"><strong>{linkCopy.label}</strong><small>{linkCopy.description}</small></span>
                <ExternalLink size={14} aria-hidden="true" />
              </button>
            )
          })}
        </div>

        <div className="support-dialog-footer">
          <span>{supportCopy.footer}</span>
          <button className="settings-secondary-button" type="button" onClick={closeDialog}>{supportCopy.close}</button>
        </div>
      </section>
    </div>
  )
}
