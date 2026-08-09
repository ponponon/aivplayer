import { describe, expect, it } from 'vitest'
import { filterTaskCenterEvents, mergeTaskCenterEvent, paginateTaskCenterEvents, sortTaskCenterEvents } from '../../src/core/tasks/task-center-model'
import type { TaskCenterEvent } from '../../src/shared/task-center-types'

function event(id: string, status: TaskCenterEvent['status'], updatedAt: number): TaskCenterEvent {
  return { id, kind: 'asr', status, title: id, message: id, progress: null, updatedAt }
}

describe('task center model', () => {
  it('replaces an event and keeps active jobs above finished jobs', () => {
    const initial = [event('done', 'completed', 30), event('running', 'running', 10)]
    const merged = mergeTaskCenterEvent(initial, event('running', 'completed', 40))
    expect(merged.map((item) => item.id)).toEqual(['running', 'done'])
    expect(merged[0]?.updatedAt).toBe(40)
  })

  it('limits the list while retaining newest events', () => {
    const sorted = sortTaskCenterEvents([event('a', 'completed', 1), event('b', 'completed', 3), event('c', 'running', 2)], 2)
    expect(sorted.map((item) => item.id)).toEqual(['c', 'b'])
  })

  it('filters by status and searches task details without mutating the source order', () => {
    const events = [
      { ...event('video', 'completed', 3), title: '导入视频', message: '已完成', current: '/movies/demo.mp4' },
      { ...event('subtitle', 'running', 2), title: '生成字幕', message: '正在识别', current: 'episode-01.mp4' },
      { ...event('vision', 'failed', 1), title: '视觉索引', message: '文件不可读' }
    ]

    expect(filterTaskCenterEvents(events, { query: 'episode-01' }).map((item) => item.id)).toEqual(['subtitle'])
    expect(filterTaskCenterEvents(events, { query: '视觉', status: 'failed' }).map((item) => item.id)).toEqual(['vision'])
    expect(filterTaskCenterEvents(events, { query: '视频', status: 'running' })).toEqual([])
    expect(events.map((item) => item.id)).toEqual(['video', 'subtitle', 'vision'])
  })

  it('clamps page indexes and exposes navigation state', () => {
    const events = Array.from({ length: 17 }, (_, index) => event(`task-${index}`, 'completed', index))

    const firstPage = paginateTaskCenterEvents(events, 0, 8)
    expect(firstPage.items.map((item) => item.id)).toEqual(Array.from({ length: 8 }, (_, index) => `task-${index}`))
    expect(firstPage).toMatchObject({ pageIndex: 0, pageCount: 3, hasPrevious: false, hasNext: true })

    const lastPage = paginateTaskCenterEvents(events, 99, 8)
    expect(lastPage.items.map((item) => item.id)).toEqual(['task-16'])
    expect(lastPage).toMatchObject({ pageIndex: 2, pageCount: 3, hasPrevious: true, hasNext: false })

    expect(paginateTaskCenterEvents([], -1, 0)).toMatchObject({ items: [], pageIndex: 0, pageCount: 1, hasPrevious: false, hasNext: false })
  })
})
