import type { AsrErrorDetails, BatchSubtitleItem } from './media-types'

export type BatchSubtitleFailureCategory = 'retryable' | 'needs-attention' | 'other'

export function isBatchSubtitleRetryableError(details?: AsrErrorDetails): boolean {
  if (!details) {
    return false
  }

  return details.code === 'network-error' || (
    details.code === 'http-error' && (
      details.status === 429 ||
      (details.status != null && details.status >= 500 && details.status <= 599)
    )
  )
}

export function getBatchSubtitleFailureCategory(
  item: Pick<BatchSubtitleItem, 'status' | 'errorDetails'>
): BatchSubtitleFailureCategory | null {
  if (item.status !== 'failed') {
    return null
  }

  if (isBatchSubtitleRetryableError(item.errorDetails)) {
    return 'retryable'
  }

  if (
    item.errorDetails?.code === 'http-error' ||
    item.errorDetails?.code === 'invalid-json' ||
    item.errorDetails?.code === 'invalid-response'
  ) {
    return 'needs-attention'
  }

  return 'other'
}
