import type { WebShareMediaItem } from '../shared/web-types'

type ApiError = { message?: string }

function isApiError(value: unknown): value is ApiError {
  return value !== null && typeof value === 'object' && 'message' in value
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = -1
  do { value /= 1024; unitIndex += 1 } while (value >= 1024 && unitIndex < units.length - 1)
  return `${value.toFixed(value >= 10 ? 1 : 2)} ${units[unitIndex]}`
}

export function formatDuration(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '--:--'
  const totalSeconds = Math.round(seconds)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const remainder = totalSeconds % 60
  return hours > 0 ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`
}

export function getSupportLabel(item: WebShareMediaItem): string {
  if (item.browserSupport === 'likely') return '浏览器优先支持'
  if (item.browserSupport === 'possible') return '浏览器兼容性待确认'
  if (item.browserSupport === 'needs-transcode') return '可能需要转码'
  return '格式待确认'
}

export function getSupportClass(item: WebShareMediaItem): string { return `support-${item.browserSupport}` }
export function formatProgress(progress: number | null): string { return progress == null || !Number.isFinite(progress) ? '处理中' : `${Math.round(progress * 100)}%` }

export async function readJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init)
  const body = await response.json() as T | ApiError
  if (!response.ok) throw new Error(isApiError(body) && typeof body.message === 'string' ? body.message : `请求失败（${response.status}）`)
  return body as T
}
