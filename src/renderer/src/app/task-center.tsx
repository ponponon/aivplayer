import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, CircleAlert, Clock3, ListTodo, LoaderCircle, PauseCircle, Search, X } from 'lucide-react'
import { useMemo, useState } from 'react'
import { filterTaskCenterEvents, paginateTaskCenterEvents, type TaskCenterFilter } from '../../../core/tasks/task-center-model'
import type { LocaleCopy } from '../../../shared/i18n'
import type { TaskCenterEvent, TaskCenterStatus } from '../../../shared/task-center-types'
import { isTaskCenterActive } from '../../../shared/task-center-types'
import { useTaskCenter } from './use-task-center'

type TaskCenterProps = {
  copy: LocaleCopy['taskCenter']
}

const TASK_CENTER_STATUS_OPTIONS: TaskCenterStatus[] = ['queued', 'running', 'paused', 'completed', 'failed', 'cancelled']

function statusIcon(status: TaskCenterStatus): React.ReactElement {
  if (status === 'completed') return <CheckCircle2 size={13} />
  if (status === 'failed') return <CircleAlert size={13} />
  if (status === 'cancelled') return <X size={13} />
  if (status === 'paused') return <PauseCircle size={13} />
  if (status === 'queued') return <Clock3 size={13} />
  return <LoaderCircle className="task-center-spinner" size={13} />
}

function progressLabel(progress: number | null): string {
  return progress === null ? '' : `${Math.round(progress * 100)}%`
}

function TaskRow({ event, copy }: { event: TaskCenterEvent; copy: TaskCenterProps['copy'] }): React.ReactElement {
  const progress = progressLabel(event.progress)
  return <li className={`task-center-item is-${event.status}`}>
    <div className="task-center-item-heading"><span className="task-center-status-icon">{statusIcon(event.status)}</span><strong>{event.title}</strong><span className="task-center-status-label">{copy.statuses[event.status]}</span>{progress ? <span className="task-center-percent">{progress}</span> : null}</div>
    <p>{event.message}</p>
    {event.current ? <small>{event.current}</small> : null}
    {event.progress !== null && isTaskCenterActive(event.status) ? <div className="task-center-progress"><span style={{ width: `${Math.round(event.progress * 100)}%` }} /></div> : null}
  </li>
}

export function TaskCenter({ copy }: TaskCenterProps): React.ReactElement | null {
  const { events, activeCount, clearFinished } = useTaskCenter()
  const [expanded, setExpanded] = useState(true)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<TaskCenterFilter>('all')
  const [pageIndex, setPageIndex] = useState(0)
  const filteredEvents = useMemo(() => filterTaskCenterEvents(events, { query, status }), [events, query, status])
  const page = useMemo(() => paginateTaskCenterEvents(filteredEvents, pageIndex, 8), [filteredEvents, pageIndex])
  if (events.length === 0) return null
  const visibleEvents = expanded ? page.items : events.filter((event) => isTaskCenterActive(event.status)).slice(0, 3)
  const updateQuery = (value: string) => {
    setQuery(value)
    setPageIndex(0)
  }
  const updateStatus = (value: TaskCenterFilter) => {
    setStatus(value)
    setPageIndex(0)
  }

  return <aside className={`task-center${expanded ? ' is-expanded' : ' is-collapsed'}`} aria-label={copy.title}>
    <header className="task-center-header"><div className="task-center-title"><ListTodo size={15} /><strong>{copy.title}</strong>{activeCount > 0 ? <span>{copy.activeCount(activeCount)}</span> : null}</div><div className="task-center-header-actions"><button type="button" aria-label={expanded ? copy.collapse : copy.expand} title={expanded ? copy.collapse : copy.expand} onClick={() => setExpanded((current) => !current)}>{expanded ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>{activeCount < events.length ? <button type="button" aria-label={copy.clearCompleted} title={copy.clearCompleted} onClick={clearFinished}><X size={14} /></button> : null}</div></header>
    {expanded ? <>
      <div className="task-center-filters">
        <label className="task-center-search"><Search size={12} /><input type="search" value={query} aria-label={copy.searchPlaceholder} placeholder={copy.searchPlaceholder} onChange={(event) => updateQuery(event.target.value)} /></label>
        <select aria-label={copy.filterLabel} value={status} onChange={(event) => updateStatus(event.target.value as TaskCenterFilter)}>
          <option value="all">{copy.filterAll}</option>
          {TASK_CENTER_STATUS_OPTIONS.map((item) => <option key={item} value={item}>{copy.statuses[item]}</option>)}
        </select>
      </div>
      <div className="task-center-result-count">{copy.resultCount(filteredEvents.length, events.length)}</div>
      <ol className="task-center-list">{visibleEvents.length > 0 ? visibleEvents.map((event) => <TaskRow key={event.id} event={event} copy={copy} />) : <li className="task-center-empty">{copy.noResults}</li>}</ol>
      {page.pageCount > 1 ? <nav className="task-center-pagination" aria-label={copy.title}>
        <button type="button" aria-label={copy.previousPage} title={copy.previousPage} disabled={!page.hasPrevious} onClick={() => setPageIndex(page.pageIndex - 1)}><ChevronLeft size={13} /></button>
        <span>{copy.page(page.pageIndex + 1, page.pageCount)}</span>
        <button type="button" aria-label={copy.nextPage} title={copy.nextPage} disabled={!page.hasNext} onClick={() => setPageIndex(page.pageIndex + 1)}><ChevronRight size={13} /></button>
      </nav> : null}
    </> : null}
  </aside>
}
