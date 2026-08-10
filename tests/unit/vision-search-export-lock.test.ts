import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { acquireVisionSearchExportOutputLock, getVisionSearchExportOutputLockPath, VisionSearchExportOutputLockError, VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION, withVisionSearchExportOutputLock } from '../../src/core/ai/vision-search-export-lock'

describe('vision search export output lock', () => {
  it('serializes writers across lock acquisitions and releases by token', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-export-lock-'))
    try {
      const outputPath = join(root, 'results.json')
      const first = await acquireVisionSearchExportOutputLock(outputPath, 'task-first')
      expect(first.lockPath).toBe(getVisionSearchExportOutputLockPath(outputPath))
      await expect(acquireVisionSearchExportOutputLock(outputPath, 'task-second')).rejects.toMatchObject({
        code: 'VISION_SEARCH_EXPORT_OUTPUT_LOCKED',
        outputPath,
        owner: { taskId: 'task-first', pid: process.pid }
      })

      await first.release()
      const second = await acquireVisionSearchExportOutputLock(outputPath, 'task-second')
      await second.release()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('removes a lock left by a process that is no longer alive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-export-lock-stale-'))
    try {
      const outputPath = join(root, 'results.json')
      await writeFile(getVisionSearchExportOutputLockPath(outputPath), JSON.stringify({
        schemaVersion: VISION_SEARCH_EXPORT_OUTPUT_LOCK_SCHEMA_VERSION,
        token: 'stale-token',
        pid: 2_147_483_647,
        createdAt: Date.now() - 60_000,
        outputPath
      }))
      const replacement = await acquireVisionSearchExportOutputLock(outputPath, 'replacement')
      await replacement.release()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('releases the lock when the operation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aivplayer-export-lock-operation-'))
    try {
      const outputPath = join(root, 'results.json')
      await expect(withVisionSearchExportOutputLock(outputPath, async () => {
        throw new Error('write failed')
      })).rejects.toThrow('write failed')
      await expect(acquireVisionSearchExportOutputLock(outputPath)).resolves.toBeTruthy()
    } finally {
      await rm(root, { recursive: true, force: true })
    }
  })

  it('exposes a typed conflict error', () => {
    const error = new VisionSearchExportOutputLockError('/tmp/results.json', '/tmp/results.json.aivplayer.lock')
    expect(error).toBeInstanceOf(Error)
    expect(error.code).toBe('VISION_SEARCH_EXPORT_OUTPUT_LOCKED')
  })
})
