import type { VisionSearchResult } from '../../shared/vision-types'

export type VisionSearchSelectionState = 'empty' | 'partial' | 'all'

export function getVisionSearchResultIds(results: readonly VisionSearchResult[]): string[] {
  return [...new Set(results.map((result) => result.id).filter((id) => id.trim().length > 0))]
}

export function getVisionSearchSelectionState(results: readonly VisionSearchResult[], selectedIds: ReadonlySet<string>): VisionSearchSelectionState {
  const resultIds = getVisionSearchResultIds(results)
  if (resultIds.length === 0) return 'empty'
  const selectedCount = resultIds.filter((id) => selectedIds.has(id)).length
  return selectedCount === 0 ? 'empty' : selectedCount === resultIds.length ? 'all' : 'partial'
}

/** Toggles only the current result page and preserves selections from other pages / views. */
export function toggleVisionSearchResultPageSelection(results: readonly VisionSearchResult[], selectedIds: ReadonlySet<string>): Set<string> {
  const resultIds = getVisionSearchResultIds(results)
  const resultIdSet = new Set(resultIds)
  const state = getVisionSearchSelectionState(results, selectedIds)
  const next = new Set(selectedIds)
  if (state === 'all') {
    resultIdSet.forEach((id) => next.delete(id))
    return next
  }
  resultIds.forEach((id) => next.add(id))
  return next
}
