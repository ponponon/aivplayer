import { describe, expect, it } from 'vitest'
import { cosineSimilarity, scanVisionSimilarMediaSources, selectVisionSimilarMediaFrames } from '../../src/core/ai/vision-similar-media'
import type { VisionLibrarySource } from '../../src/shared/vision-types'

const source = (sourceId: string, videoPath: string): VisionLibrarySource => ({
  sourceId,
  videoPath,
  fileName: videoPath.split('/').pop() ?? videoPath,
  fileSizeBytes: 100,
  fileMtimeMs: 1,
  frameCount: 4,
  indexedAtMs: 1,
  subtitlePath: null,
  thumbnailPath: `/thumbnails/${sourceId}.jpg`,
  metadata: null
})

const frame = (sourceId: string, videoPath: string, frameId: string, timestampSeconds: number, embedding: number[]) => ({
  frameId,
  sourceId,
  videoPath,
  fileName: videoPath.split('/').pop() ?? videoPath,
  timestampSeconds,
  thumbnailPath: `/thumbnails/${frameId}.jpg`,
  embedding
})

describe('vision similar media', () => {
  it('calculates cosine similarity and rejects zero vectors', () => {
    expect(cosineSimilarity([1, 0], [0.99, 0.1])).toBeCloseTo(0.9949, 3)
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0)
  })

  it('selects deterministic timeline-spread representatives per source', () => {
    const frames = [0, 1, 2, 3, 4].map((timestamp) => frame('source-a', '/a.mp4', `frame-${timestamp}`, timestamp, [1, timestamp]))
    expect(selectVisionSimilarMediaFrames(frames, 3).map((item) => item.timestampSeconds)).toEqual([0, 2, 4])
  })

  it('groups cross-source high-similarity frames without calling them exact duplicates', async () => {
    const sourceA = source('source-a', '/a.mp4')
    const sourceB = source('source-b', '/b.mp4')
    const sourceC = source('source-c', '/c.mp4')
    const result = await scanVisionSimilarMediaSources([sourceA, sourceB, sourceC], [
      frame('source-a', '/a.mp4', 'a-1', 2, [1, 0]),
      frame('source-b', '/b.mp4', 'b-1', 4, [0.99, 0.1]),
      frame('source-c', '/c.mp4', 'c-1', 1, [0, 1])
    ])

    expect(result).toMatchObject({ status: 'completed', scannedSourceCount: 3, sampledFrameCount: 3, comparedPairCount: 3, skippedSourceCount: 0 })
    expect(result.groups).toHaveLength(1)
    expect(result.groups[0]?.matches.map((match) => match.source.sourceId)).toEqual(['source-a', 'source-b'])
    expect(result.groups[0]?.bestScore).toBeGreaterThan(0.99)
  })

  it('does not compare frames from the same source and supports cancellation', async () => {
    const controller = new AbortController()
    controller.abort()
    await expect(scanVisionSimilarMediaSources([
      source('source-a', '/a.mp4'),
      source('source-b', '/b.mp4')
    ], [
      frame('source-a', '/a.mp4', 'a-1', 0, [1, 0]),
      frame('source-a', '/a.mp4', 'a-2', 1, [1, 0]),
      frame('source-b', '/b.mp4', 'b-1', 0, [1, 0])
    ], { signal: controller.signal })).rejects.toMatchObject({ name: 'AbortError' })

    const result = await scanVisionSimilarMediaSources([
      source('source-a', '/a.mp4')
    ], [
      frame('source-a', '/a.mp4', 'a-1', 0, [1, 0]),
      frame('source-a', '/a.mp4', 'a-2', 1, [1, 0])
    ])
    expect(result.comparedPairCount).toBe(0)
    expect(result.groups).toEqual([])
  })
})
