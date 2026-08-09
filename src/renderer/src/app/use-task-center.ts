import { useEffect, useState } from 'react'
import type { TaskCenterEvent } from '../../../shared/task-center-types'
import { isTaskCenterActive } from '../../../shared/task-center-types'
import { mergeTaskCenterEvent, sortTaskCenterEvents } from '../../../core/tasks/task-center-model'

export function useTaskCenter(): {
  events: TaskCenterEvent[]
  activeCount: number
  clearFinished: () => void
} {
  const [events, setEvents] = useState<TaskCenterEvent[]>([])

  useEffect(() => {
    let active = true
    const removeListener = window.aiv.onTaskCenterEvent((event) => {
      setEvents((current) => mergeTaskCenterEvent(current, event))
    })
    void window.aiv.getTaskCenterEvents().then((history) => {
      if (!active) return
      setEvents((current) => history.reduce((merged, event) => mergeTaskCenterEvent(merged, event), current))
    }).catch(() => undefined)
    return () => {
      active = false
      removeListener()
    }
  }, [])

  return {
    events,
    activeCount: events.filter((event) => isTaskCenterActive(event.status)).length,
    clearFinished: () => {
      void window.aiv.clearTaskCenterFinished().then(() => {
        setEvents((current) => sortTaskCenterEvents(current.filter((event) => isTaskCenterActive(event.status))))
      }).catch(() => undefined)
    }
  }
}
