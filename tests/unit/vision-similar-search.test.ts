import { describe, expect, it } from 'vitest'
import { createVisionSimilarSearchRequest, isVisionSimilarSearchTarget, normalizeVisionSimilarSearchLimit, normalizeVisionSimilarSearchRequest, VISION_SIMILAR_SEARCH_MAX_LIMIT } from '../../src/core/ai/vision-similar-search'
import type { VisionSearchResult } from '../../src/shared/vision-types'

const result: VisionSearchResult = {
  id: 'frame-1',
  videoPath: '/videos/demo.mp4',
  fileName: 'demo.mp4',
  timestampSeconds: 12.5,
  thumbnailPath: '/index/thumbnails/frame-1.jpg',
  score: 0.9,
  frameId: 'frame-1',
  modelId: 'model',
  modelVariant: 'variant'
}

describe('vision similar search', () => {
  it('builds a bounded request from a visual result', () => {
    expect(createVisionSimilarSearchRequest(result, 999)).toEqual({
      resultId: 'frame-1',
      frameId: 'frame-1',
      videoPath: '/videos/demo.mp4',
      timestampSeconds: 12.5,
      thumbnailPath: '/index/thumbnails/frame-1.jpg',
      limit: VISION_SIMILAR_SEARCH_MAX_LIMIT
    })
  })

  it('rejects missing media anchors and normalizes untrusted fields', () => {
    expect(normalizeVisionSimilarSearchRequest({ videoPath: '  ', timestampSeconds: 1 })).toBeNull()
    expect(normalizeVisionSimilarSearchRequest({ videoPath: '/videos/demo.mp4', timestampSeconds: -1 })).toBeNull()
    expect(normalizeVisionSimilarSearchRequest({ videoPath: ' /videos/demo.mp4 ', timestampSeconds: 2.5, frameId: ' frame-2 ', limit: 0 })).toEqual({
      frameId: 'frame-2',
      videoPath: '/videos/demo.mp4',
      timestampSeconds: 2.5,
      limit: 1
    })
  })

  it('clamps the result window and excludes the source frame', () => {
    expect(normalizeVisionSimilarSearchLimit(Number.NaN)).toBe(24)
    expect(normalizeVisionSimilarSearchLimit(101)).toBe(VISION_SIMILAR_SEARCH_MAX_LIMIT)
    const request = createVisionSimilarSearchRequest(result)
    expect(isVisionSimilarSearchTarget(result, request)).toBe(true)
    expect(isVisionSimilarSearchTarget({ ...result, id: 'frame-2', frameId: 'frame-2' }, request)).toBe(false)
  })
})
