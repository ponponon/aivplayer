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
})
