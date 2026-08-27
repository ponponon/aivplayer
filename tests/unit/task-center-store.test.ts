import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TaskCenterStore } from '../../src/core/tasks/task-center-store'
import type { TaskCenterEvent } from '../../src/shared/task-center-types'

function event(id: string, status: TaskCenterEvent['status'], updatedAt: number): TaskCenterEvent {
  return { id, kind: 'vision-index', status, title: id, message: id, progress: status === 'completed' ? 1 : 0, updatedAt }
}

describe('task center store', () => {
  it('persists only terminal events and restores the latest snapshot', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aivplayer-task-center-'))
    try {
      const store = new TaskCenterStore(root)
      store.record(event('running', 'running', 1))
      store.record(event('done', 'completed', 2))
      await store.flush()

      const restored = new TaskCenterStore(root)
      expect(restored.list().map((item) => item.id)).toEqual(['done'])
      restored.record(event('done', 'failed', 3))
      await restored.flush()
      expect(new TaskCenterStore(root).list()).toEqual([event('done', 'failed', 3)])
      restored.clearFinished()
      await restored.flush()
      expect(new TaskCenterStore(root).list()).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('removes a single terminal event from memory and persistence', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aivplayer-task-center-remove-'))
    try {
      const store = new TaskCenterStore(root)
      store.record(event('first', 'completed', 1))
      store.record(event('second', 'failed', 2))
      await store.flush()

      store.remove('first')
      await store.flush()

      expect(store.list().map((item) => item.id)).toEqual(['second'])

      store.remove('missing')
      await store.flush()
      expect(new TaskCenterStore(root).list().map((item) => item.id)).toEqual(['second'])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('ignores visual runtime setup failures instead of showing them as completed tasks', async () => {
    const root = mkdtempSync(join(tmpdir(), 'aivplayer-task-center-vision-setup-'))
    try {
      const store = new TaskCenterStore(root)
      store.record({
        id: 'vision-index:missing-pack',
        kind: 'vision-index',
        status: 'failed',
        title: '视觉索引',
        message: 'Vision Pack 0.6.3 未安装，无法加载 @lancedb/lancedb',
        progress: 0,
        updatedAt: 10
      })
      await store.flush()

      expect(store.list()).toEqual([])
      expect(new TaskCenterStore(root).list()).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
