import { formatTime } from '../lib/time'
import type { MediaProbeDetailObject } from '../../../shared/media-types'

export type MediaProbeEntry = {
  key: string
  value: unknown
}

export function formatFileSize(bytes: number | null | undefined): string {
  if (bytes == null || !Number.isFinite(bytes) || bytes < 0) {
    return '--'
  }
  if (bytes < 1024 * 1024) {
    return `${Math.max(1, Math.round(bytes / 1024))} KB`
  }
  const sizeInMb = bytes / (1024 * 1024)
  return sizeInMb >= 10 ? `${sizeInMb.toFixed(1)} MB` : `${sizeInMb.toFixed(2)} MB`
}

export function formatBitrate(kbps: number | null | undefined): string {
  if (kbps == null || !Number.isFinite(kbps) || kbps < 0) {
    return '--'
  }
  return `${Math.round(kbps)} kb/s`
}

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) {
    return '--'
  }
  return formatTime(seconds)
}

export function formatDetailValue(value: unknown): string {
  if (value == null) {
    return '--'
  }
  if (typeof value === 'string') {
    return value.length > 0 ? value : '--'
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      return '--'
    }
    const rounded = Math.round(value * 1000) / 1000
    return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(3).replace(/\.?0+$/, '')
  }
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false'
  }
  return String(value)
}

export function humanizeKey(key: string, probeFieldLabels?: Record<string, string>): string {
  if (probeFieldLabels?.[key]) {
    return probeFieldLabels[key]
  }
  const lowerKey = key.toLowerCase()
  if (probeFieldLabels?.[lowerKey]) {
    return probeFieldLabels[lowerKey]
  }
  const dottedKey = key.replace(/_/g, '.')
  if (probeFieldLabels?.[dottedKey]) {
    return probeFieldLabels[dottedKey]
  }
  return key
    .replace(/\[(\d+)\]/g, ' [$1]')
    .split('.')
    .map((part) => part.replace(/_/g, ' ').trim().replace(/\b[a-z]/gi, (character) => character.toUpperCase()))
    .join(' · ')
}

export function flattenProbeEntries(value: unknown, prefix = ''): MediaProbeEntry[] {
  if (Array.isArray(value)) {
    return value.length === 0
      ? prefix ? [{ key: prefix, value: '[]' }] : []
      : value.flatMap((item, index) => flattenProbeEntries(item, prefix ? `${prefix}[${index}]` : `[${index}]`))
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
    return entries.length === 0
      ? prefix ? [{ key: prefix, value: '{}' }] : []
      : entries.flatMap(([key, item]) => flattenProbeEntries(item, prefix ? `${prefix}.${key}` : key))
  }
  return prefix ? [{ key: prefix, value }] : []
}

export function getStreamTitle(stream: MediaProbeDetailObject, index: number): string {
  const codecType = typeof stream.codec_type === 'string' && stream.codec_type.trim().length > 0
    ? stream.codec_type.trim()
    : 'stream'
  return `Stream #${index + 1} · ${codecType}`
}
