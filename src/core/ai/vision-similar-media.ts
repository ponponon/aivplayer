import type { VisionLibrarySource, VisionSimilarMediaGroup, VisionSimilarMediaMatch, VisionSimilarMediaScanResult } from '../../shared/vision-types'

export const VISION_SIMILAR_MEDIA_MIN_SCORE = 0.94
export const VISION_SIMILAR_MEDIA_MAX_SOURCES = 500
export const VISION_SIMILAR_MEDIA_MAX_FRAMES_PER_SOURCE = 3
export const VISION_SIMILAR_MEDIA_MAX_GROUPS = 100

export type VisionSimilarMediaFrame = {
  frameId: string
  sourceId: string
  videoPath: string
  fileName: string
  timestampSeconds: number
  thumbnailPath: string
  embedding: readonly number[]
}

export type VisionSimilarMediaScanOptions = {
  signal?: AbortSignal
  minScore?: number
  maxSources?: number
  maxFramesPerSource?: number
  maxGroups?: number
}

type SimilarEdge = {
  left: VisionSimilarMediaFrame
  right: VisionSimilarMediaFrame
  score: number
}

function throwIfAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return
  const error = new Error('相似素材扫描已取消')
  error.name = 'AbortError'
  throw error
}

function normalizeLimit(value: number | undefined, fallback: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback
  return Math.min(maximum, Math.max(1, Math.floor(value as number)))
}

function normalizeScore(value: number | undefined): number {
  if (!Number.isFinite(value)) return VISION_SIMILAR_MEDIA_MIN_SCORE
  return Math.min(1, Math.max(0, value as number))
}

function compareFrames(left: VisionSimilarMediaFrame, right: VisionSimilarMediaFrame): number {
  const timeDelta = left.timestampSeconds - right.timestampSeconds
  if (Number.isFinite(timeDelta) && timeDelta !== 0) return timeDelta
  return left.frameId.localeCompare(right.frameId)
}

function compareMatches(left: VisionSimilarMediaMatch, right: VisionSimilarMediaMatch): number {
  return right.score - left.score || left.source.sourceId.localeCompare(right.source.sourceId) || left.frameId.localeCompare(right.frameId)
}

function createRepresentativeIndexes(frameCount: number, maxFrames: number): number[] {
  if (frameCount <= maxFrames) return Array.from({ length: frameCount }, (_, index) => index)
  const indexes = [0, Math.floor((frameCount - 1) / 2), frameCount - 1]
  return [...new Set(indexes)].slice(0, maxFrames)
}

/** Selects deterministic samples spread across each source's timeline. */
export function selectVisionSimilarMediaFrames(frames: readonly VisionSimilarMediaFrame[], maxFramesPerSource = VISION_SIMILAR_MEDIA_MAX_FRAMES_PER_SOURCE): VisionSimilarMediaFrame[] {
  const limit = normalizeLimit(maxFramesPerSource, VISION_SIMILAR_MEDIA_MAX_FRAMES_PER_SOURCE, 16)
  const grouped = new Map<string, VisionSimilarMediaFrame[]>()
  for (const frame of frames) {
    const sourceId = frame.sourceId.trim()
    if (!sourceId || !frame.frameId.trim()) continue
    const sourceFrames = grouped.get(sourceId) ?? []
    sourceFrames.push({ ...frame, sourceId })
    grouped.set(sourceId, sourceFrames)
  }
  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([, sourceFrames]) => {
      const sorted = [...sourceFrames].sort(compareFrames)
      return createRepresentativeIndexes(sorted.length, limit).map((index) => sorted[index]!).filter(Boolean)
    })
}

function vectorNorm(vector: readonly number[]): number {
  let sum = 0
  for (const value of vector) {
    if (!Number.isFinite(value)) continue
    sum += value * value
  }
  return Math.sqrt(sum)
}

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length)
  if (length === 0) return 0
  let dot = 0
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index]
    const rightValue = right[index]
    if (Number.isFinite(leftValue) && Number.isFinite(rightValue)) dot += leftValue * rightValue
  }
  const denominator = vectorNorm(left) * vectorNorm(right)
  if (denominator <= 0) return 0
  return Math.min(1, Math.max(-1, dot / denominator))
}

function createUnionFind(ids: readonly string[]): { find: (id: string) => string; union: (left: string, right: string) => void } {
  const parents = new Map(ids.map((id) => [id, id]))
  const find = (id: string): string => {
    const parent = parents.get(id) ?? id
    if (parent === id) return id
    const root = find(parent)
    parents.set(id, root)
    return root
  }
  const union = (left: string, right: string): void => {
    const leftRoot = find(left)
    const rightRoot = find(right)
    if (leftRoot !== rightRoot) parents.set(rightRoot, leftRoot)
  }
  return { find, union }
}

function buildGroups(sources: readonly VisionLibrarySource[], edges: readonly SimilarEdge[], maxGroups: number): VisionSimilarMediaGroup[] {
  const sourceById = new Map(sources.map((source) => [source.sourceId.trim(), source]))
  const sourceIds = [...new Set(edges.flatMap((edge) => [edge.left.sourceId, edge.right.sourceId]))].sort()
  const unionFind = createUnionFind(sourceIds)
  for (const edge of edges) unionFind.union(edge.left.sourceId, edge.right.sourceId)

  const edgesByRoot = new Map<string, SimilarEdge[]>()
  for (const edge of edges) {
    const root = unionFind.find(edge.left.sourceId)
    const groupEdges = edgesByRoot.get(root) ?? []
    groupEdges.push(edge)
    edgesByRoot.set(root, groupEdges)
  }

  const groups = [...edgesByRoot.values()].map((groupEdges): VisionSimilarMediaGroup | null => {
    const matchesBySource = new Map<string, VisionSimilarMediaMatch>()
    for (const edge of groupEdges) {
      for (const [frame, score] of [[edge.left, edge.score], [edge.right, edge.score]] as const) {
        const source = sourceById.get(frame.sourceId)
        if (!source) continue
        const match: VisionSimilarMediaMatch = { source, frameId: frame.frameId, timestampSeconds: frame.timestampSeconds, thumbnailPath: frame.thumbnailPath, score }
        const previous = matchesBySource.get(frame.sourceId)
        if (!previous || compareMatches(match, previous) < 0) matchesBySource.set(frame.sourceId, match)
      }
    }
    const matches = [...matchesBySource.values()].sort(compareMatches)
    if (matches.length < 2) return null
    const sourceKey = matches.map((match) => match.source.sourceId).sort().join('|')
    return { id: `similar-media-${sourceKey}`, bestScore: matches[0]?.score ?? 0, matches }
  }).filter((group): group is VisionSimilarMediaGroup => group !== null)

  return groups
    .sort((left, right) => right.bestScore - left.bestScore || left.id.localeCompare(right.id))
    .slice(0, maxGroups)
}

export async function scanVisionSimilarMediaSources(
  sources: readonly VisionLibrarySource[],
  frames: readonly VisionSimilarMediaFrame[],
  options: VisionSimilarMediaScanOptions = {}
): Promise<VisionSimilarMediaScanResult> {
  const maxSources = normalizeLimit(options.maxSources, VISION_SIMILAR_MEDIA_MAX_SOURCES, VISION_SIMILAR_MEDIA_MAX_SOURCES)
  const maxFramesPerSource = normalizeLimit(options.maxFramesPerSource, VISION_SIMILAR_MEDIA_MAX_FRAMES_PER_SOURCE, 16)
  const maxGroups = normalizeLimit(options.maxGroups, VISION_SIMILAR_MEDIA_MAX_GROUPS, VISION_SIMILAR_MEDIA_MAX_GROUPS)
  const minScore = normalizeScore(options.minScore)
  const sourceById = new Map(sources.filter((source) => source.sourceId.trim()).map((source) => [source.sourceId.trim(), source]))
  const sampledFrames = selectVisionSimilarMediaFrames(frames, maxFramesPerSource).filter((frame) => sourceById.has(frame.sourceId))
  const framesBySource = new Map<string, VisionSimilarMediaFrame[]>()
  for (const frame of sampledFrames) {
    const sourceFrames = framesBySource.get(frame.sourceId) ?? []
    sourceFrames.push(frame)
    framesBySource.set(frame.sourceId, sourceFrames)
  }
  const activeSourceIds = [...framesBySource.keys()].sort()
  const comparedSourceIds = activeSourceIds.slice(0, maxSources)
  const comparedSourceSet = new Set(comparedSourceIds)
  const edges: SimilarEdge[] = []
  let comparedPairCount = 0

  for (let leftIndex = 0; leftIndex < comparedSourceIds.length; leftIndex += 1) {
    throwIfAborted(options.signal)
    const leftSourceId = comparedSourceIds[leftIndex]!
    const leftFrames = framesBySource.get(leftSourceId) ?? []
    for (let rightIndex = leftIndex + 1; rightIndex < comparedSourceIds.length; rightIndex += 1) {
      const rightSourceId = comparedSourceIds[rightIndex]!
      const rightFrames = framesBySource.get(rightSourceId) ?? []
      for (const left of leftFrames) {
        for (const right of rightFrames) {
          comparedPairCount += 1
          const score = cosineSimilarity(left.embedding, right.embedding)
          if (score >= minScore) edges.push({ left, right, score })
          if (comparedPairCount % 256 === 0) {
            throwIfAborted(options.signal)
            await Promise.resolve()
          }
        }
      }
    }
  }

  const comparedSources = comparedSourceIds.map((id) => sourceById.get(id)).filter((source): source is VisionLibrarySource => Boolean(source))
  return {
    status: 'completed',
    scannedSourceCount: sources.length,
    sampledFrameCount: sampledFrames.filter((frame) => comparedSourceSet.has(frame.sourceId)).length,
    comparedPairCount,
    skippedSourceCount: Math.max(0, activeSourceIds.length - comparedSourceIds.length),
    groups: buildGroups(comparedSources, edges, maxGroups)
  }
}
