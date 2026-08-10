import { describe, expect, it } from 'vitest'
import { groupVisionSimilarSearchResults, sortVisionSimilarSearchGroups, VISION_SIMILAR_SHOT_GROUP_GAP_SECONDS } from '../../src/core/ai/vision-similar-search-groups'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function result(id: string, videoPath: string, timestampSeconds: number, score: number): VisionSearchResult {
  return {
    id,
    videoPath,
    fileName: videoPath.split('/').pop() ?? videoPath,
    timestampSeconds,
    thumbnailPath: `/thumbnails/${id}.jpg`,
    score,
    modelId: 'model',
    modelVariant: 'variant'
  }
}

describe('vision similar search groups', () => {
  it('groups adjacent frames from the same source and preserves the best match first', () => {
    const groups = groupVisionSimilarSearchResults([
      result('frame-3', '/videos/b.mp4', 3, 0.82),
      result('frame-1', '/videos/a.mp4', 0, 0.91),
      result('frame-2', '/videos/a.mp4', 3, 0.8),
      result('frame-4', '/videos/a.mp4', 20, 0.95)
    ])

    expect(groups).toHaveLength(3)
    expect(groups[0]?.results.map((item) => item.id)).toEqual(['frame-4'])
    expect(groups[1]?.results.map((item) => item.id)).toEqual(['frame-1', 'frame-2'])
    expect(groups[1]?.startSeconds).toBe(0)
    expect(groups[1]?.endSeconds).toBe(3)
    expect(groups[2]?.videoPath).toBe('/videos/b.mp4')
  })

  it('starts a new group after the time gap or source changes', () => {
    const groups = groupVisionSimilarSearchResults([
      result('frame-1', '/videos/a.mp4', 0, 0.8),
      result('frame-2', '/videos/a.mp4', VISION_SIMILAR_SHOT_GROUP_GAP_SECONDS + 0.1, 0.7),
      result('frame-3', '/videos/b.mp4', VISION_SIMILAR_SHOT_GROUP_GAP_SECONDS + 0.2, 0.6)
    ])

    expect(groups.map((group) => group.results.map((item) => item.id))).toEqual([['frame-1'], ['frame-2'], ['frame-3']])
  })

  it('keeps invalid timestamps isolated instead of merging them silently', () => {
    const groups = groupVisionSimilarSearchResults([
      result('frame-1', '/videos/a.mp4', Number.NaN, 0.9),
      result('frame-2', '/videos/a.mp4', 1, 0.8)
    ])

    expect(groups).toHaveLength(2)
    expect(groups.flatMap((group) => group.results.map((item) => item.id))).toEqual(['frame-1', 'frame-2'])
  })

  it('keeps the existing result sort choices meaningful for grouped results', () => {
    const groups = groupVisionSimilarSearchResults([
      result('frame-b', '/videos/b.mp4', 2, 0.8),
      result('frame-a', '/videos/a.mp4', 5, 0.7)
    ])

    expect(sortVisionSimilarSearchGroups(groups, 'source-time').map((group) => group.videoPath)).toEqual(['/videos/a.mp4', '/videos/b.mp4'])
    expect(sortVisionSimilarSearchGroups(groups, 'file-name').map((group) => group.fileName)).toEqual(['a.mp4', 'b.mp4'])
  })
})
