import { describe, expect, it } from 'vitest'
import { getBatchSubtitleFailureCategory, isBatchSubtitleRetryableError } from '../../src/shared/batch-subtitle-utils'

describe('batch subtitle failure classification', () => {
  it('marks network, rate limit, and server errors as retryable', () => {
    expect(isBatchSubtitleRetryableError({ code: 'network-error' })).toBe(true)
    expect(isBatchSubtitleRetryableError({ code: 'http-error', status: 429 })).toBe(true)
    expect(isBatchSubtitleRetryableError({ code: 'http-error', status: 503 })).toBe(true)
  })

  it('keeps authentication and response-shape errors out of automatic retry', () => {
    expect(isBatchSubtitleRetryableError({ code: 'http-error', status: 401 })).toBe(false)
    expect(isBatchSubtitleRetryableError({ code: 'invalid-json' })).toBe(false)
    expect(isBatchSubtitleRetryableError({ code: 'invalid-response' })).toBe(false)
  })

  it('returns a UI-friendly category for failed items', () => {
    expect(getBatchSubtitleFailureCategory({ status: 'failed', errorDetails: { code: 'network-error' } })).toBe('retryable')
    expect(getBatchSubtitleFailureCategory({ status: 'failed', errorDetails: { code: 'http-error', status: 401 } })).toBe('needs-attention')
    expect(getBatchSubtitleFailureCategory({ status: 'failed' })).toBe('other')
    expect(getBatchSubtitleFailureCategory({ status: 'completed' })).toBeNull()
  })
})
