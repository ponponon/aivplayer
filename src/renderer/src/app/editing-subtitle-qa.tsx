import { ListChecks } from 'lucide-react'
import type { LocaleCopy } from '../../../shared/i18n'
import type { SubtitleQaIssue } from '../../../shared/subtitle-qa'
import { formatTime } from '../lib/time'

type Props = {
  issues: readonly SubtitleQaIssue[]
  copy: LocaleCopy['editing']
  onSeek: (seconds: number) => void
}

export function EditingSubtitleQa({ issues, copy, onSeek }: Props): React.ReactElement {
  return <details className="editing-subtitle-qa" data-testid="editing-subtitle-qa">
    <summary className="editing-subtitle-qa-summary"><ListChecks size={14} aria-hidden="true" /><span>{copy.subtitleQaTitle}</span><small>{copy.subtitleQaIssueCount(issues.length)}</small></summary>
    <div className="editing-subtitle-qa-panel">
      {issues.length === 0 ? <p className="editing-subtitle-qa-empty">{copy.subtitleQaClear}</p> : <div className="editing-subtitle-qa-list">{issues.map((item) => <button className={`editing-subtitle-qa-item is-${item.severity}`} type="button" key={item.id} data-testid="subtitle-qa-issue" onClick={() => onSeek(item.startSeconds)} title={`${copy.subtitleQaJump} · ${formatTime(item.startSeconds)}`}>
        <span className="editing-subtitle-qa-time">{formatTime(item.startSeconds)}</span>
        <span className="editing-subtitle-qa-copy"><strong>{copy.subtitleQaKindLabels[item.kind]}</strong><small>{copy.subtitleQaMessage(item.kind, item.value ?? 0)}</small></span>
        <em>{copy.subtitleQaJump}</em>
      </button>)}</div>}
    </div>
  </details>
}
