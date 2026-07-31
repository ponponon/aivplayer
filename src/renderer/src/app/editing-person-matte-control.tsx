import { ScanFace } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { PersonMatteModelDownloadProgress, PersonMatteModelStatus } from '../../../shared/person-matte-types'

type EditingPersonMatteControlProps = {
  title: string
  readyLabel: string
  missingLabel: string
  downloadLabel: string
  downloadingLabel: string
  modelFileLabel: (path: string) => string
  failureLabel: (message: string) => string
}

export function EditingPersonMatteControl({ title, readyLabel, missingLabel, downloadLabel, downloadingLabel, modelFileLabel, failureLabel }: EditingPersonMatteControlProps): React.ReactElement {
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

  return <details className="editing-person-matte-control" data-testid="editing-person-matte-control" onClick={(event) => event.stopPropagation()}>
    <summary className="editing-person-matte-summary"><ScanFace size={13} /><span>{title}</span><strong className={status?.available ? 'is-ready' : 'is-missing'}>{statusLabel}</strong></summary>
    <div className="editing-person-matte-popover">
      <div className="editing-person-matte-status"><span>{statusLabel}</span><small>{status ? modelFileLabel(status.modelDirectory) : '…'}</small></div>
      {progress && busy ? <div className="editing-person-matte-progress" role="status"><span>{progress.relativePath}</span><strong>{percent === null ? '…' : `${percent}%`}</strong><i><b style={{ width: percent === null ? '0%' : `${percent}%` }} /></i></div> : null}
      {failure ? <p className="editing-person-matte-error" role="alert">{failure}</p> : null}
      {!status?.available ? <button className="editing-person-matte-download" type="button" onClick={() => void download()} disabled={busy} data-testid="editing-person-matte-download"><ScanFace size={13} />{busy ? downloadingLabel : downloadLabel}</button> : null}
    </div>
  </details>
}
