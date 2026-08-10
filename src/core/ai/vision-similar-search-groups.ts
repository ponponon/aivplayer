import type { VisionSearchResult } from '../../shared/vision-types'

export const VISION_SIMILAR_SHOT_GROUP_GAP_SECONDS = 6

export type VisionSimilarSearchGroup = {
  id: string
  videoPath: string
  fileName: string
  startSeconds: number
  endSeconds: number
  results: VisionSearchResult[]
}

type IndexedResult = {
  result: VisionSearchResult
  sourceOrder: number
}

function normalizeGapSeconds(value: number | undefined): number {
  if (!Number.isFinite(value)) return VISION_SIMILAR_SHOT_GROUP_GAP_SECONDS
  return Math.min(60, Math.max(0, value as number))
}

function compareBySourceTime(left: IndexedResult, right: IndexedResult): number {
  const sourceOrder = left.result.videoPath.localeCompare(right.result.videoPath)
  if (sourceOrder !== 0) return sourceOrder
  const timeOrder = left.result.timestampSeconds - right.result.timestampSeconds
  if (Number.isFinite(timeOrder) && timeOrder !== 0) return timeOrder
  return left.sourceOrder - right.sourceOrder
}

function compareByRelevance(left: VisionSimilarSearchGroup, right: VisionSimilarSearchGroup): number {
  const scoreOrder = (right.results[0]?.score ?? 0) - (left.results[0]?.score ?? 0)
  if (scoreOrder !== 0) return scoreOrder
  const sourceOrder = left.videoPath.localeCompare(right.videoPath)
  if (sourceOrder !== 0) return sourceOrder
  return left.startSeconds - right.startSeconds
}

export function groupVisionSimilarSearchResults(
  results: readonly VisionSearchResult[],
  gapSeconds?: number
): VisionSimilarSearchGroup[] {
  const gap = normalizeGapSeconds(gapSeconds)
  const sorted = results.map((result, sourceOrder) => ({ result, sourceOrder })).sort(compareBySourceTime)
  const groups: VisionSimilarSearchGroup[] = []

  for (const indexed of sorted) {
    const result = indexed.result
    const previous = groups[groups.length - 1]
    const previousResult = previous?.results[previous.results.length - 1]
    const sameSource = previous?.videoPath === result.videoPath
    const hasValidTimes = Number.isFinite(result.timestampSeconds) && Number.isFinite(previousResult?.timestampSeconds)
    const isAdjacent = sameSource && hasValidTimes && result.timestampSeconds - (previousResult?.timestampSeconds ?? 0) <= gap
    if (!previous || !isAdjacent) {
      groups.push({
        id: `similar-group:${result.id}`,
        videoPath: result.videoPath,
        fileName: result.fileName,
        startSeconds: result.timestampSeconds,
        endSeconds: result.timestampSeconds,
        results: [result]
      })
      continue
    }
    previous.results.push(result)
    previous.endSeconds = Math.max(previous.endSeconds, result.timestampSeconds)
  }

  return groups
    .map((group) => ({ ...group, results: [...group.results].sort((left, right) => right.score - left.score || left.timestampSeconds - right.timestampSeconds) }))
    .sort(compareByRelevance)
}
