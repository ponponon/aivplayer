import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { beginVisionIndexFailureRetry, beginVisionIndexFailureRetryBatch, normalizeVisionIndexFailureManifest, recordVisionIndexFailure } from '../../src/core/ai/vision-index-failure'
import { VisionIndexFailureStore } from '../../src/core/ai/vision-index-failure-store'

describe('vision index failure recovery', () => {
  it('deduplicates a media path and preserves retry history', () => {
    const first = recordVisionIndexFailure([], { mediaPath: '/media/../media/demo.mp4', error: 'ffmpeg 失败' }, 10)
    const retried = beginVisionIndexFailureRetry(first, first[0].id, 20)
    expect(retried).toMatchObject({ mediaPath: '/media/demo.mp4', retryCount: 1, lastAttemptAt: 20 })

    const updated = recordVisionIndexFailure([retried!], { mediaPath: '/media/demo.mp4', error: '模型加载失败', stage: 'loading-model' }, 30)
    expect(updated).toHaveLength(1)
    expect(updated[0]).toMatchObject({ error: '模型加载失败', retryCount: 1, failedAt: 10, lastAttemptAt: 30, stage: 'loading-model' })
  })

  it('drops malformed records and bounds error messages', () => {
    const normalized = normalizeVisionIndexFailureManifest({ schemaVersion: 1, records: [{ mediaPath: '/media/demo.mp4', error: 'x'.repeat(3_000) }, { mediaPath: '' }] }, 10)
    expect(normalized.records).toHaveLength(1)
    expect(normalized.records[0].error).toHaveLength(2_000)
  })

  it('retries a valid batch atomically and rejects unknown or duplicate ids', () => {
    const records = recordVisionIndexFailure(recordVisionIndexFailure([], { mediaPath: '/media/one.mp4', error: 'one' }, 10), { mediaPath: '/media/two.mp4', error: 'two' }, 20)
    const retried = beginVisionIndexFailureRetryBatch(records, [records[0].id, records[1].id], 30)
    expect(retried?.every((record) => record.retryCount === 1 && record.lastAttemptAt === 30)).toBe(true)
    expect(beginVisionIndexFailureRetryBatch(records, [records[0].id, 'unknown'], 40)).toBeNull()
    expect(beginVisionIndexFailureRetryBatch(records, [records[0].id, records[0].id], 40)).toBeNull()
    expect(records.every((record) => record.retryCount === 0)).toBe(true)
  })

  it('persists records atomically and restores them after restart', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-vision-failure-'))
    try {
      const store = new VisionIndexFailureStore(directory)
      store.recordFailure({ mediaPath: '/media/demo.mp4', error: '无法读取视频', intervalSeconds: 5, includeEntityEvidence: true, includeObjectEvidence: true, stage: 'frames' })
      await store.flush()

      const restored = new VisionIndexFailureStore(directory)
      expect(restored.list()[0]).toMatchObject({ mediaPath: '/media/demo.mp4', intervalSeconds: 5, includeEntityEvidence: true, includeObjectEvidence: true, stage: 'frames', retryCount: 0 })
      const retry = restored.beginRetry(restored.list()[0].id)
      expect(retry?.retryCount).toBe(1)
      restored.clear('/media/demo.mp4')
      await restored.flush()
      expect(new VisionIndexFailureStore(directory).list()).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('does not persist a missing visual runtime as an index failure', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'aivplayer-vision-failure-setup-'))
    try {
      const store = new VisionIndexFailureStore(directory)
      expect(store.recordFailure({
        mediaPath: '/media/demo.mp4',
        error: 'Vision Pack 0.5.5 未安装，无法加载 @lancedb/lancedb',
        intervalSeconds: 5,
        includeEntityEvidence: true,
        includeObjectEvidence: true,
        stage: 'loading-model'
      })).toBeNull()
      expect(store.list()).toEqual([])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
