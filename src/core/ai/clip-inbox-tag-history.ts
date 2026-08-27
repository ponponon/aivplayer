import type { VisionClipCollectionTagOperationHistoryEntry, VisionClipCollectionTagOperationHistoryExportManifest, VisionClipCollectionTagOperationHistoryFilter, VisionClipCollectionTagOperationHistoryPage, VisionClipCollectionTagOperationHistoryPageRequest } from '../../shared/vision-types'

const TAG_OPERATION_HISTORY_FILTERS: readonly VisionClipCollectionTagOperationHistoryFilter[] = ['all', 'cleanup', 'rename', 'metadata', 'batch', 'single']
export const VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE = 20
export const VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_MAX_PAGE_SIZE = 20

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

export function normalizeVisionClipCollectionTagOperationHistoryPageRequest(value: unknown): Required<VisionClipCollectionTagOperationHistoryPageRequest> {
  const candidate = value && typeof value === 'object' ? value as Partial<VisionClipCollectionTagOperationHistoryPageRequest> : {}
  const offset = typeof candidate.offset === 'number' && Number.isFinite(candidate.offset) && candidate.offset >= 0 ? Math.floor(candidate.offset) : 0
  const limit = typeof candidate.limit === 'number' && Number.isFinite(candidate.limit)
    ? Math.min(VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_MAX_PAGE_SIZE, Math.max(1, Math.floor(candidate.limit)))
    : VISION_CLIP_COLLECTION_TAG_OPERATION_HISTORY_PAGE_SIZE
  return { offset, limit, filter: normalizeVisionClipCollectionTagOperationHistoryFilter(candidate.filter) }
}

export function paginateVisionClipCollectionTagOperationHistory(
  entries: readonly VisionClipCollectionTagOperationHistoryEntry[],
  request: unknown = {}
): VisionClipCollectionTagOperationHistoryPage {
  const normalized = normalizeVisionClipCollectionTagOperationHistoryPageRequest(request)
  const filteredEntries = filterVisionClipCollectionTagOperationHistory(entries, normalized.filter)
  const pageEntries = filteredEntries.slice(normalized.offset, normalized.offset + normalized.limit).map((entry) => ({ ...entry }))
  return {
    entries: pageEntries,
    offset: normalized.offset,
    limit: normalized.limit,
    total: filteredEntries.length,
    hasMore: normalized.offset + pageEntries.length < filteredEntries.length
  }
}
