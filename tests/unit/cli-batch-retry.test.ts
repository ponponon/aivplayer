import { describe, expect, it } from 'vitest'
import { BatchStageError, getBatchRetryDelayMs, isRetryableBatchStageError, runBatchStageWithRetry } from '../../src/cli/cli-batch'

describe('aivcli batch retry policy', () => {
  it('uses exponential backoff with a cap', () => {
    expect(getBatchRetryDelayMs(0)).toBe(0)
    expect(getBatchRetryDelayMs(1)).toBe(1_000)
    expect(getBatchRetryDelayMs(2)).toBe(2_000)
    expect(getBatchRetryDelayMs(3)).toBe(4_000)
    expect(getBatchRetryDelayMs(10)).toBe(30_000)
  })

  it('retries network and server failures but not permanent request failures', () => {
    expect(isRetryableBatchStageError(new BatchStageError('服务暂时不可用', { code: 'http-error', status: 503 }))).toBe(true)
    expect(isRetryableBatchStageError(new BatchStageError('请求被拒绝', { code: 'http-error', status: 401 }))).toBe(false)
    expect(isRetryableBatchStageError(new BatchStageError('响应格式错误', { code: 'invalid-json' }))).toBe(false)
    expect(isRetryableBatchStageError(new Error('network timeout'))).toBe(true)
    expect(isRetryableBatchStageError(new Error('未找到原文 VTT'))).toBe(false)
  })

  it('records each scheduled retry and resumes the stage after the backoff', async () => {
    let attempts = 0
    const scheduled: number[] = []
    const ready: number[] = []
    const result = await runBatchStageWithRetry({
      stage: 'translate',
      maxRetries: 2,
      initialRetryCount: 0,
      mediaPath: '/videos/one.mp4',
      report: () => undefined,
      task: async () => {
        attempts += 1
        if (attempts < 3) throw new BatchStageError('服务暂时不可用', { code: 'http-error', status: 503 })
        return 'translated'
      },
      onRetryScheduled: async (retry) => {
        scheduled.push(retry.attempt)
      },
      onRetryReady: async () => {
        ready.push(attempts)
      },
      wait: async () => undefined
    })

    expect(result).toEqual({ value: 'translated', retries: 2 })
    expect(scheduled).toEqual([1, 2])
    expect(ready).toEqual([1, 2])
  })
})
