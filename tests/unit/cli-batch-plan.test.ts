import { describe, expect, it } from 'vitest'
import { parseBatchPlan } from '../../src/cli/cli-batch-plan'
import { parseCliArgs } from '../../src/cli/cli-parser'

describe('aivcli batch plan', () => {
  it('composes ASR, translation and index stages', () => {
    const plan = parseBatchPlan(parseCliArgs([
      'batch', './videos', '--recursive', '--asr', '--translate', 'zh', '--from', 'en', '--index', '--format', 'srt', '--interval', '5', '--force', '--fail-fast'
    ]))

    expect(plan).toMatchObject({
      inputs: ['./videos'],
      recursive: true,
      asr: true,
      translateLanguage: 'zh',
      sourceLanguage: 'en',
      index: true,
      format: 'srt',
      intervalSeconds: 5,
      retryCount: 2,
      force: true,
      failFast: true
    })
  })

  it('requires at least one batch stage', () => {
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos']))).toThrow('至少指定一个任务')
  })

  it('requires a translation target and rejects conflicting stop policies', () => {
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos', '--translate']))).toThrow('--translate 必须是')
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--fail-fast', '--continue-on-error']))).toThrow('不能同时使用')
  })

  it('requires explicit reset when forcing a resumed task', () => {
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--resume', '--force']))).toThrow('--resume 和 --force')
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--resume', '--reset-state']))).toThrow('--resume 和 --reset-state')
  })

  it('uses two recoverable retries by default and validates the override', () => {
    expect(parseBatchPlan(parseCliArgs(['batch', './videos', '--asr'])).retryCount).toBe(2)
    expect(parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--retry', '0'])).retryCount).toBe(0)
    expect(parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--retry', '5'])).retryCount).toBe(5)
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--retry', '6']))).toThrow('--retry 必须是 0 到 5 之间的整数')
    expect(() => parseBatchPlan(parseCliArgs(['batch', './videos', '--asr', '--retry', '1.5']))).toThrow('--retry 必须是 0 到 5 之间的整数')
  })
})
