import type { EditingScriptSegment } from '../../shared/editing-types'

export function selectEditingScriptSegmentRange(segments: readonly EditingScriptSegment[], selectedSegmentIds: readonly string[], anchorSegmentId: string | null, targetSegmentId: string): string[] {
  const activeSegments = segments.filter((segment) => !segment.deleted)
  const anchorIndex = activeSegments.findIndex((segment) => segment.id === anchorSegmentId)
  const targetIndex = activeSegments.findIndex((segment) => segment.id === targetSegmentId)
  if (targetIndex < 0) return [...selectedSegmentIds]
  if (anchorIndex < 0) {
    return selectedSegmentIds.includes(targetSegmentId)
      ? selectedSegmentIds.filter((id) => id !== targetSegmentId)
      : [...selectedSegmentIds, targetSegmentId]
  }
  const start = Math.min(anchorIndex, targetIndex)
  const end = Math.max(anchorIndex, targetIndex)
  const next = new Set(selectedSegmentIds)
  for (const segment of activeSegments.slice(start, end + 1)) next.add(segment.id)
  return activeSegments.filter((segment) => next.has(segment.id)).map((segment) => segment.id)
}
