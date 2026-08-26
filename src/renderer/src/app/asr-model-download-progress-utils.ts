export function formatDownloadBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`

  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unitIndex = 0
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  const precision = value >= 100 ? 0 : 1
  return `${Number(value.toFixed(precision))} ${units[unitIndex]}`
}

export function calculateDownloadSpeed(
  previousReceivedBytes: number,
  receivedBytes: number,
  elapsedMs: number
): number | null {
  if (!Number.isFinite(previousReceivedBytes) || !Number.isFinite(receivedBytes) || !Number.isFinite(elapsedMs)) return null
  if (elapsedMs <= 0 || receivedBytes < previousReceivedBytes) return null

  const deltaBytes = receivedBytes - previousReceivedBytes
  if (deltaBytes <= 0) return null
  return deltaBytes / (elapsedMs / 1000)
}

export function estimateDownloadEtaMs(
  receivedBytes: number,
  totalBytes: number | null,
  bytesPerSecond: number | null
): number | null {
  if (totalBytes == null || !Number.isFinite(totalBytes) || totalBytes <= 0) return null
  if (bytesPerSecond == null || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return null

  const remainingBytes = Math.max(0, totalBytes - receivedBytes)
  return (remainingBytes / bytesPerSecond) * 1000
}

export function getDownloadPercent(
  percent: number | null,
  receivedBytes: number,
  totalBytes: number | null
): number | null {
  const resolvedPercent = percent ?? (totalBytes && totalBytes > 0 ? receivedBytes / totalBytes : null)
  if (resolvedPercent == null || !Number.isFinite(resolvedPercent)) return null
  return Math.max(0, Math.min(1, resolvedPercent))
}
