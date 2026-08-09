import type { TaskCenterEvent } from '../../shared/task-center-types'
import type { TaskCenterStatus } from '../../shared/task-center-types'
import { isTaskCenterActive } from '../../shared/task-center-types'

export type TaskCenterFilter = 'all' | TaskCenterStatus

export type TaskCenterFilterOptions = {
  query?: string
  status?: TaskCenterFilter
}

export type TaskCenterPage = {
  items: TaskCenterEvent[]
  pageIndex: number
  pageCount: number
  hasPrevious: boolean
  hasNext: boolean
}

function compareEvents(left: TaskCenterEvent, right: TaskCenterEvent): number {
  const activeDelta = Number(isTaskCenterActive(right.status)) - Number(isTaskCenterActive(left.status))
  return activeDelta || right.updatedAt - left.updatedAt
}

export function mergeTaskCenterEvent(current: readonly TaskCenterEvent[], next: TaskCenterEvent, limit = 40): TaskCenterEvent[] {
  const merged = [...current.filter((item) => item.id !== next.id), next]
  return merged.sort(compareEvents).slice(0, Math.max(1, limit))
}

export function sortTaskCenterEvents(events: readonly TaskCenterEvent[], limit = 40): TaskCenterEvent[] {
  return [...events].sort(compareEvents).slice(0, Math.max(1, limit))
}

export function filterTaskCenterEvents(events: readonly TaskCenterEvent[], options: TaskCenterFilterOptions = {}): TaskCenterEvent[] {
  const query = options.query?.trim().toLocaleLowerCase() ?? ''
  const status = options.status ?? 'all'

  return events.filter((event) => {
    if (status !== 'all' && event.status !== status) return false
    if (!query) return true

    return [event.title, event.message, event.current ?? '', event.kind]
      .join('\u0000')
      .toLocaleLowerCase()
      .includes(query)
  })
}

export function paginateTaskCenterEvents(events: readonly TaskCenterEvent[], pageIndex = 0, pageSize = 8): TaskCenterPage {
  const safePageSize = Math.max(1, Math.floor(pageSize))
  const pageCount = Math.max(1, Math.ceil(events.length / safePageSize))
  const safePageIndex = Math.min(Math.max(0, Math.floor(pageIndex)), pageCount - 1)
  const start = safePageIndex * safePageSize

  return {
    items: events.slice(start, start + safePageSize),
    pageIndex: safePageIndex,
    pageCount,
    hasPrevious: safePageIndex > 0,
    hasNext: safePageIndex < pageCount - 1
  }
}
