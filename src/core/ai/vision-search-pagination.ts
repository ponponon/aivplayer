export const VISION_SEARCH_PAGE_SIZE = 24
export const VISION_SEARCH_MAX_RESULTS = 100

function normalizeLimit(value: number, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return Math.min(fallback, maximum)
  return Math.min(maximum, Math.max(1, Math.floor(value)))
}

/** Returns the next bounded result window for a repeated visual search. */
export function getNextVisionSearchLimit(
  currentLimit: number,
  pageSize = VISION_SEARCH_PAGE_SIZE,
  maximum = VISION_SEARCH_MAX_RESULTS
): number {
  const normalizedMaximum = normalizeLimit(maximum, VISION_SEARCH_MAX_RESULTS, VISION_SEARCH_MAX_RESULTS)
  const normalizedCurrent = normalizeLimit(currentLimit, VISION_SEARCH_PAGE_SIZE, normalizedMaximum)
  const normalizedPageSize = normalizeLimit(pageSize, VISION_SEARCH_PAGE_SIZE, normalizedMaximum)
  return Math.min(normalizedMaximum, normalizedCurrent + normalizedPageSize)
}

/** A full result window is only evidence of more results before the hard cap. */
export function shouldLoadMoreVisionSearchResults(
  resultCount: number,
  requestedLimit: number,
  maximum = VISION_SEARCH_MAX_RESULTS
): boolean {
  const normalizedMaximum = normalizeLimit(maximum, VISION_SEARCH_MAX_RESULTS, VISION_SEARCH_MAX_RESULTS)
  const normalizedLimit = normalizeLimit(requestedLimit, VISION_SEARCH_PAGE_SIZE, normalizedMaximum)
  return normalizedLimit < normalizedMaximum && Number.isFinite(resultCount) && Math.max(0, Math.floor(resultCount)) >= normalizedLimit
}
