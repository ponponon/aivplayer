import type { ReactElement } from 'react'
import type { AsrSubtitleSummaryChapter } from '../../../shared/media-types'
import { formatTime } from '../lib/time'
import { useAppContext } from './app-context'

export function SummaryChapters({ chapters, title }: { chapters: AsrSubtitleSummaryChapter[]; title: string }): ReactElement {
  const app = useAppContext()
  return <section className="summary-section summary-chapters">
    <h4>{title}</h4>
    <div className="summary-chapter-list">
      {chapters.map((chapter) => {
        const time = formatTime(chapter.timeSeconds)
        return <button
          key={`${chapter.timeSeconds}-${chapter.title}`}
          className="summary-chapter"
          type="button"
          title={app.copy.summary.chapterJumpHint(time)}
          aria-label={`${chapter.title} · ${app.copy.summary.chapterJumpHint(time)}`}
          onClick={() => app.seekTo(chapter.timeSeconds)}
        >
          <span className="summary-chapter-time">{time}</span>
          <span className="summary-chapter-content"><strong>{chapter.title}</strong>{chapter.summary ? <small>{chapter.summary}</small> : null}</span>
        </button>
      })}
    </div>
  </section>
}
