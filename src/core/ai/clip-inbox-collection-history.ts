import type { VisionClipCollectionOperationHistoryEntry, VisionClipCollectionOperationHistoryExportManifest, VisionClipCollectionOperationHistoryFilter, VisionClipCollectionOperationHistoryStatusFilter, VisionClipCollectionOperationHistoryTypeFilter } from '../../shared/vision-types'

const COLLECTION_OPERATION_HISTORY_TYPE_FILTERS: readonly VisionClipCollectionOperationHistoryTypeFilter[] = ['all', 'flags', 'merge', 'delete', 'rename', 'duplicate', 'content']
const COLLECTION_OPERATION_HISTORY_STATUS_FILTERS: readonly VisionClipCollectionOperationHistoryStatusFilter[] = ['all', 'active', 'undone', 'redoable']

export function normalizeVisionClipCollectionOperationHistoryTypeFilter(value: unknown): VisionClipCollectionOperationHistoryTypeFilter {
  return COLLECTION_OPERATION_HISTORY_TYPE_FILTERS.includes(value as VisionClipCollectionOperationHistoryTypeFilter)
    ? value as VisionClipCollectionOperationHistoryTypeFilter
    : 'all'
}

export function normalizeVisionClipCollectionOperationHistoryStatusFilter(value: unknown): VisionClipCollectionOperationHistoryStatusFilter {
  return COLLECTION_OPERATION_HISTORY_STATUS_FILTERS.includes(value as VisionClipCollectionOperationHistoryStatusFilter)
    ? value as VisionClipCollectionOperationHistoryStatusFilter
    : 'all'
}

export function normalizeVisionClipCollectionOperationHistoryFilter(value: unknown): VisionClipCollectionOperationHistoryFilter {
  const candidate = value && typeof value === 'object' ? value as Partial<VisionClipCollectionOperationHistoryFilter> : {}
  return {
    type: normalizeVisionClipCollectionOperationHistoryTypeFilter(candidate.type),
    status: normalizeVisionClipCollectionOperationHistoryStatusFilter(candidate.status)
  }
}

export function filterVisionClipCollectionOperationHistory(entries: readonly VisionClipCollectionOperationHistoryEntry[], filter: unknown = {}): VisionClipCollectionOperationHistoryEntry[] {
  const normalized = normalizeVisionClipCollectionOperationHistoryFilter(filter)
  return entries
    .filter((entry) => (normalized.type === 'all' || entry.type === normalized.type) && (normalized.status === 'all' || entry.status === normalized.status))
    .map((entry) => ({ ...entry, collectionIds: [...entry.collectionIds], collectionTitles: [...entry.collectionTitles] }))
}

export function serializeVisionClipCollectionOperationHistory(
  entries: readonly VisionClipCollectionOperationHistoryEntry[],
  filter: unknown = {},
  exportedAt = Date.now()
): string {
  const normalizedFilter = normalizeVisionClipCollectionOperationHistoryFilter(filter)
  const normalizedExportedAt = Number.isFinite(exportedAt) ? Math.max(0, Math.floor(exportedAt)) : Date.now()
  const manifest: VisionClipCollectionOperationHistoryExportManifest = {
    schemaVersion: 1,
    typeFilter: normalizedFilter.type,
    statusFilter: normalizedFilter.status,
    exportedAt: normalizedExportedAt,
    entries: filterVisionClipCollectionOperationHistory(entries, normalizedFilter)
  }
  return JSON.stringify(manifest, null, 2)
}
