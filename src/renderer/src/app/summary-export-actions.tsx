import { Clipboard, Download } from 'lucide-react'
import { useState, type ReactElement } from 'react'
import type { AsrSubtitleSummaryExportFormat } from '../../../shared/media-types'
import { useAppContext } from './app-context'

const formats: AsrSubtitleSummaryExportFormat[] = ['markdown', 'txt', 'json']

export function SummaryExportActions(): ReactElement {
  const app = useAppContext()
  const [format, setFormat] = useState<AsrSubtitleSummaryExportFormat>('markdown')
  const copy = app.copy.summary

  return <div className="summary-export-actions">
    <div className="summary-export-row">
      <button className="summary-export-button" type="button" onClick={() => void app.copySummary()} disabled={app.isExportingSummary}>
        <Clipboard size={14} />{copy.copyText}
      </button>
      <div className="summary-export-picker">
        <select className="summary-export-format" value={format} onChange={(event) => setFormat(event.currentTarget.value as AsrSubtitleSummaryExportFormat)} disabled={app.isExportingSummary} aria-label={copy.exportTitle}>
          <option value="markdown">{copy.formatMarkdown}</option>
          <option value="txt">{copy.formatText}</option>
          <option value="json">{copy.formatJson}</option>
        </select>
        <button className="summary-export-button primary" type="button" onClick={() => void app.exportSummary(format)} disabled={app.isExportingSummary}>
          <Download size={14} />{copy.export}
        </button>
      </div>
    </div>
    {app.summaryExportMessage ? <p className="summary-export-status" role="status">{app.summaryExportMessage}</p> : null}
  </div>
}
