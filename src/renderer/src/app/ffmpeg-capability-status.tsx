import { CheckCircle2, CircleAlert, LoaderCircle } from 'lucide-react'
import { useEffect, useState, type ReactElement } from 'react'
import type { MediaFfmpegCapabilities } from '../../../shared/media-types'
import type { LocaleCopy } from '../../../shared/i18n'

export function useFfmpegCapabilities(enabled: boolean): { capabilities: MediaFfmpegCapabilities | null; isChecking: boolean } {
  const [capabilities, setCapabilities] = useState<MediaFfmpegCapabilities | null>(null)
  useEffect(() => {
    if (!enabled) {
      setCapabilities(null)
      return
    }
    let active = true
    void window.aiv.getFfmpegCapabilities().then((next) => {
      if (active) setCapabilities(next)
    }).catch(() => {
      if (active) setCapabilities({ available: false, subtitleBurnIn: false, subtitleFilter: null })
    })
    return () => { active = false }
  }, [enabled])
  return { capabilities, isChecking: enabled && capabilities === null }
}

type FfmpegCapabilityStatusProps = {
  copy: LocaleCopy['editing']
  enabled: boolean
  capabilities: MediaFfmpegCapabilities | null
  isChecking: boolean
}

export function FfmpegCapabilityStatus({ copy, enabled, capabilities, isChecking }: FfmpegCapabilityStatusProps): ReactElement | null {
  if (!enabled) return null
  const ready = capabilities?.subtitleBurnIn === true
  return (
    <section className={`editing-export-capability ${isChecking ? 'is-checking' : ready ? 'is-ready' : 'is-error'}`} data-testid="editing-export-capability" data-state={isChecking ? 'checking' : ready ? 'ready' : 'error'} role={ready || isChecking ? 'status' : 'alert'}>
      <div className="editing-export-capability-heading">
        <strong>{copy.exportCapabilityTitle}</strong>
        <span>{isChecking ? <><LoaderCircle size={13} className="editing-export-capability-spinner" />{copy.exportCapabilityChecking}</> : ready ? <><CheckCircle2 size={13} />{copy.exportCapabilityReady}</> : <><CircleAlert size={13} />{copy.exportCapabilityMissing}</>}</span>
      </div>
    </section>
  )
}
