import { describe, expect, it } from 'vitest'
import { groupVisionDuplicateMediaCandidates, scanVisionDuplicateMediaSources } from '../../src/core/ai/vision-duplicate-media'
import type { VisionLibrarySource } from '../../src/shared/vision-types'

const source = (sourceId: string, videoPath: string, fileSizeBytes = 100, favorite = false): VisionLibrarySource => ({
  sourceId,
  videoPath,
  fileName: videoPath.split('/').pop() ?? videoPath,
  fileSizeBytes,
  fileMtimeMs: 1,
  frameCount: 3,
  indexedAtMs: 1,
  subtitlePath: null,
  thumbnailPath: null,
  metadata: favorite ? { tags: [], favorite: true, note: '', source: null, projectId: null } : null
})

const hash = 'A'.repeat(64)
const otherHash = 'B'.repeat(64)

describe('vision duplicate media', () => {
  it('groups exact hashes and prefers a favorite source as the primary entry', () => {
    const groups = groupVisionDuplicateMediaCandidates([
      { source: source('source-b', '/media/longer/demo.mp4'), contentHash: hash },
      { source: source('source-a', '/media/demo.mp4', 100, true), contentHash: hash },
      { source: source('source-c', '/media/unique.mp4'), contentHash: otherHash }
    ])

    expect(groups).toHaveLength(1)
    expect(groups[0]?.sources.map((item) => item.sourceId)).toEqual(['source-a', 'source-b'])
    expect(groups[0]?.duplicateBytes).toBe(100)
  })

  it('rejects invalid hashes and duplicate source rows', () => {
    const groups = groupVisionDuplicateMediaCandidates([
      { source: source('source-a', '/media/a.mp4'), contentHash: hash },
      { source: source('source-a', '/media/a-copy.mp4'), contentHash: hash },
      { source: source('source-b', '/media/b.mp4'), contentHash: 'not-a-sha256' }
    ])

    expect(groups).toHaveLength(0)
  })

  it('hashes only possible same-size candidates and reports unavailable files', async () => {
    const sources = [source('source-a', '/media/a.mp4', 100), source('source-b', '/media/b.mp4', 100), source('source-c', '/media/c.mp4', 200)]
    const hashed: string[] = []
    const result = await scanVisionDuplicateMediaSources(sources, async (item) => {
      hashed.push(item.sourceId)
      return item.sourceId === 'source-b' ? null : hash
    }, { concurrency: 1 })

    expect(hashed).toEqual(['source-a', 'source-b'])
    expect(result).toMatchObject({ scannedCount: 3, hashedCount: 2, cachedCount: 0, unavailableCount: 1, skippedBySizeCount: 1 })
    expect(result.groups).toHaveLength(0)
  })

  it('reuses a valid cached hash without reading the file again', async () => {
    const sources = [source('source-a', '/media/a.mp4', 100), source('source-b', '/media/b.mp4', 100)]
    let hashCalls = 0
    const result = await scanVisionDuplicateMediaSources(sources, async () => {
      hashCalls += 1
      return null
    }, {
      getCachedHash: (item) => item.sourceId === 'source-a' || item.sourceId === 'source-b' ? hash : undefined
    })

    expect(hashCalls).toBe(0)
    expect(result.cachedCount).toBe(2)
    expect(result.groups).toHaveLength(1)
  })
})
