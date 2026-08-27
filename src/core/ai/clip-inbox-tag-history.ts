import type { VisionClipCollectionTagOperationHistoryEntry, VisionClipCollectionTagOperationHistoryExportManifest, VisionClipCollectionTagOperationHistoryFilter } from '../../shared/vision-types'

const TAG_OPERATION_HISTORY_FILTERS: readonly VisionClipCollectionTagOperationHistoryFilter[] = ['all', 'cleanup', 'rename', 'metadata', 'batch']

export function normalizeVisionClipCollectionTagOperationHistoryFilter(value: unknown): VisionClipCollectionTagOperationHistoryFilter {
  return TAG_OPERATION_HISTORY_FILTERS.includes(value as VisionClipCollectionTagOperationHistoryFilter)
    ? value as VisionClipCollectionTagOperationHistoryFilter
    : 'all'
}

export function filterVisionClipCollectionTagOperationHistory(entries: readonly VisionClipCollectionTagOperationHistoryEntry[], filter: unknown = 'all'): VisionClipCollectionTagOperationHistoryEntry[] {
  const normalizedFilter = normalizeVisionClipCollectionTagOperationHistoryFilter(filter)
  if (normalizedFilter === 'all') return [...entries]
  return entries.filter((entry) => entry.type === normalizedFilter)
}

export function serializeVisionClipCollectionTagOperationHistory(
  entries: readonly VisionClipCollectionTagOperationHistoryEntry[],
  filter: unknown = 'all',
  exportedAt = Date.now()
): string {
  const normalizedExportedAt = Number.isFinite(exportedAt) ? Math.max(0, Math.floor(exportedAt)) : Date.now()
  const manifest: VisionClipCollectionTagOperationHistoryExportManifest = {
    schemaVersion: 1,
    filter: normalizeVisionClipCollectionTagOperationHistoryFilter(filter),
    exportedAt: normalizedExportedAt,
    entries: filterVisionClipCollectionTagOperationHistory(entries, filter).map((entry) => ({ ...entry }))
  }
  return JSON.stringify(manifest, null, 2)
}
