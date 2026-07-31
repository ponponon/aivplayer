import { ScanFace } from 'lucide-react'
import { useEffect, useState } from 'react'
import { getEditingPersonMatteSettings } from '../../../core/editing/person-matte'
import type { EditingPersonMatte, EditingVideoClip } from '../../../shared/editing-types'
import type { PersonMatteModelDownloadProgress, PersonMatteModelStatus } from '../../../shared/person-matte-types'

type EditingPersonMatteControlProps = {
  clip: EditingVideoClip | null
  title: string
  readyLabel: string
  missingLabel: string
  downloadLabel: string
  downloadingLabel: string
  modelFileLabel: (path: string) => string
  failureLabel: (message: string) => string
  enableLabel: string
  enabledLabel: string
  featherLabel: string
  outlineLabel: string
  outlineColorLabel: string
  onChange: (personMatte: EditingPersonMatte) => void
}

export function EditingPersonMatteControl({ clip, title, readyLabel, missingLabel, downloadLabel, downloadingLabel, modelFileLabel, failureLabel, enableLabel, enabledLabel, featherLabel, outlineLabel, outlineColorLabel, onChange }: EditingPersonMatteControlProps): React.ReactElement {
  const [status, setStatus] = useState<PersonMatteModelStatus | null>(null)
  const [progress, setProgress] = useState<PersonMatteModelDownloadProgress | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void window.aiv.getPersonMatteModelStatus().then((next) => {
      if (active) setStatus(next)
    }).catch(() => undefined)
    const removeProgress = window.aiv.onPersonMatteModelDownloadProgress((next) => {
      if (active) setProgress(next)
    })
    return () => {
      active = false
      removeProgress()
    }
  }, [])

  const download = async (): Promise<void> => {
    if (busy) return
    setBusy(true)
    setFailure(null)
    try {
      const result = await window.aiv.downloadPersonMatteModel()
      setStatus(result.status)
      if (!result.success) setFailure(failureLabel(result.message))
    } catch (error) {
      setFailure(failureLabel(error instanceof Error ? error.message : String(error)))
    } finally {
      setBusy(false)
    }
  }

  const statusLabel = status ? (status.available ? readyLabel : missingLabel) : '…'
  const percent = progress?.percent === null || progress?.percent === undefined ? null : Math.round(progress.percent * 100)
  const settings = getEditingPersonMatteSettings(clip?.personMatte)
  const hasClip = clip !== null

  return <details className="editing-person-matte-control" data-testid="editing-person-matte-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-person-matte-summary"><ScanFace size={13} /><span>{title}</span><strong className={status?.available ? 'is-ready' : 'is-missing'}>{statusLabel}</strong></summary>
    <div className="editing-person-matte-popover">
      <div className="editing-person-matte-status"><span>{statusLabel}</span><small>{status ? modelFileLabel(status.modelDirectory) : '…'}</small></div>
      {progress && busy ? <div className="editing-person-matte-progress" role="status"><span>{progress.relativePath}</span><strong>{percent === null ? '…' : `${percent}%`}</strong><i><b style={{ width: percent === null ? '0%' : `${percent}%` }} /></i></div> : null}
      {failure ? <p className="editing-person-matte-error" role="alert">{failure}</p> : null}
      {!status?.available ? <button className="editing-person-matte-download" type="button" onClick={() => void download()} disabled={busy} data-testid="editing-person-matte-download"><ScanFace size={13} />{busy ? downloadingLabel : downloadLabel}</button> : null}
      {status?.available && hasClip ? <>
        <button className={`editing-person-matte-toggle ${settings.enabled ? 'is-active' : ''}`} type="button" onClick={() => onChange({ ...settings, enabled: !settings.enabled })} aria-pressed={settings.enabled} data-testid="editing-person-matte-toggle"><ScanFace size={13} />{settings.enabled ? enabledLabel : enableLabel}</button>
        {settings.enabled ? <>
          <label className="editing-person-matte-field"><span>{featherLabel}</span><input type="range" min="0" max="12" step="1" value={settings.featherPercent} onChange={(event) => onChange({ ...settings, featherPercent: Number(event.currentTarget.value) })} aria-label={featherLabel} /><output>{settings.featherPercent}%</output></label>
          <label className="editing-person-matte-field"><span>{outlineLabel}</span><input type="range" min="0" max="4" step="0.5" value={settings.outlineWidthPercent} onChange={(event) => onChange({ ...settings, outlineWidthPercent: Number(event.currentTarget.value) })} aria-label={outlineLabel} /><output>{settings.outlineWidthPercent}%</output></label>
          <label className="editing-person-matte-color"><span>{outlineColorLabel}</span><input type="color" value={settings.outlineColor} onChange={(event) => onChange({ ...settings, outlineColor: event.currentTarget.value })} aria-label={outlineColorLabel} /></label>
        </> : null}
      </> : null}
    </div>
  </details>
}
