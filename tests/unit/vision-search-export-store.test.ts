import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getVisionSearchExportPartsDirectory, getVisionSearchExportStorePath, VisionSearchExportStore } from '../../src/core/ai/vision-search-export-store'

function input(userDataPath: string) {
  return {
    taskId: 'export-1',
    request: { kind: 'text' as const, request: { query: 'person', mode: 'hybrid' as const }, format: 'json' as const },
    outputPath: join(userDataPath, 'results.json'),
    partsDirectory: getVisionSearchExportPartsDirectory(userDataPath, 'export-1'),
    resultCount: 512
  }
}

describe('vision search export store', () => {
  it('persists task contracts and part checkpoints across store reloads', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-export-store-'))
    try {
      const store = new VisionSearchExportStore(userDataPath)
      store.create(input(userDataPath))
      store.markPartCompleted('export-1', 0, 'a'.repeat(64), 256)
      await store.flush()

      const restored = new VisionSearchExportStore(userDataPath)
      expect(restored.get('export-1')).toMatchObject({ writtenCount: 256, completedParts: { '0': 'a'.repeat(64) }, status: 'running' })
      expect(JSON.parse(await readFile(getVisionSearchExportStorePath(userDataPath), 'utf8')).schemaVersion).toBe(1)
    } finally {
      await rm(userDataPath, { recursive: true, force: true })
    }
  })

  it('keeps failed tasks retryable without discarding verified parts', async () => {
    const userDataPath = await mkdtemp(join(tmpdir(), 'aivplayer-export-store-'))
    try {
      const store = new VisionSearchExportStore(userDataPath)
      store.create(input(userDataPath))
      store.markPartCompleted('export-1', 0, 'b'.repeat(64), 256)
      store.update('export-1', { status: 'failed', error: '磁盘暂不可用' })
      expect(store.listRetryable().map((task) => task.taskId)).toEqual(['export-1'])
      expect(store.retry('export-1')).toMatchObject({ status: 'queued', writtenCount: 256, completedParts: { '0': 'b'.repeat(64) } })
    } finally {
      await rm(userDataPath, { recursive: true, force: true })
    }
  })
})
