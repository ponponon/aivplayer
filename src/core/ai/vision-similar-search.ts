import type { VisionSearchResult, VisionSimilarSearchRequest } from '../../shared/vision-types'

export const VISION_SIMILAR_SEARCH_DEFAULT_LIMIT = 24
export const VISION_SIMILAR_SEARCH_MAX_LIMIT = 100

type VisionSimilarSearchInput = Pick<VisionSearchResult, 'id' | 'videoPath' | 'timestampSeconds' | 'thumbnailPath'> & {
  frameId?: string
}

export function normalizeVisionSimilarSearchLimit(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return VISION_SIMILAR_SEARCH_DEFAULT_LIMIT
  return Math.min(VISION_SIMILAR_SEARCH_MAX_LIMIT, Math.max(1, Math.floor(value)))
}

export function createVisionSimilarSearchRequest(
  result: VisionSimilarSearchInput,
  limit = VISION_SIMILAR_SEARCH_DEFAULT_LIMIT
): VisionSimilarSearchRequest {
  return {
    resultId: result.id,
    ...(result.frameId ? { frameId: result.frameId } : {}),
    videoPath: result.videoPath,
    timestampSeconds: result.timestampSeconds,
    ...(result.thumbnailPath ? { thumbnailPath: result.thumbnailPath } : {}),
    limit: normalizeVisionSimilarSearchLimit(limit)
  }
}

export function normalizeVisionSimilarSearchRequest(value: unknown): VisionSimilarSearchRequest | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Partial<VisionSimilarSearchRequest>
  const videoPath = typeof input.videoPath === 'string' ? input.videoPath.trim() : ''
  const timestampSeconds = input.timestampSeconds
  if (!videoPath || typeof timestampSeconds !== 'number' || !Number.isFinite(timestampSeconds) || timestampSeconds < 0) return null

  const resultId = typeof input.resultId === 'string' && input.resultId.trim() ? input.resultId.trim() : undefined
  const frameId = typeof input.frameId === 'string' && input.frameId.trim() ? input.frameId.trim() : undefined
  const thumbnailPath = typeof input.thumbnailPath === 'string' && input.thumbnailPath.trim() ? input.thumbnailPath.trim() : undefined
  return {
    ...(resultId ? { resultId } : {}),
    ...(frameId ? { frameId } : {}),
    videoPath,
    timestampSeconds,
    ...(thumbnailPath ? { thumbnailPath } : {}),
    limit: normalizeVisionSimilarSearchLimit(input.limit)
  }
}

export function isVisionSimilarSearchTarget(result: VisionSearchResult, request: VisionSimilarSearchRequest): boolean {
  const targetIds = new Set([request.resultId, request.frameId].filter((value): value is string => Boolean(value)))
  return targetIds.has(result.id) || (result.frameId ? targetIds.has(result.frameId) : false)
}
