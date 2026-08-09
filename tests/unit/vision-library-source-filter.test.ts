import { describe, expect, it } from 'vitest'
import { filterVisionLibrarySources } from '../../src/core/ai/vision-library-source-filter'
import type { VisionLibrarySource } from '../../src/shared/vision-types'

function source(overrides: Partial<VisionLibrarySource>): VisionLibrarySource {
  return {
    sourceId: overrides.sourceId ?? 'source-1',
    videoPath: overrides.videoPath ?? '/media/demo.mp4',
    fileName: overrides.fileName ?? 'demo.mp4',
    fileSizeBytes: overrides.fileSizeBytes ?? 1,
    fileMtimeMs: overrides.fileMtimeMs ?? 1,
    frameCount: overrides.frameCount ?? 1,
    indexedAtMs: overrides.indexedAtMs ?? 1,
    subtitlePath: null,
    thumbnailPath: null,
    metadata: overrides.metadata ?? null
  }
}

describe('vision library source filter', () => {
  const sources = [
    source({ sourceId: 'one', fileName: 'episode-10.mp4', indexedAtMs: 20, frameCount: 4, metadata: { tags: ['海边'], favorite: true, note: '重点', source: '旅行', projectId: 'p1' } }),
    source({ sourceId: 'two', fileName: 'episode-2.mp4', indexedAtMs: 30, frameCount: 9, metadata: { tags: ['室内'], favorite: false, note: '', source: null, projectId: null } }),
    source({ sourceId: 'three', fileName: 'trailer.mp4', indexedAtMs: 10, frameCount: 2, metadata: null })
  ]

  it('searches file paths and projected metadata', () => {
    expect(filterVisionLibrarySources(sources, { query: '旅行' }).map((item) => item.sourceId)).toEqual(['one'])
    expect(filterVisionLibrarySources(sources, { query: 'trailer' }).map((item) => item.sourceId)).toEqual(['three'])
  })

  it('filters favorites and sorts by explicit mode', () => {
    expect(filterVisionLibrarySources(sources, { favoriteOnly: true }).map((item) => item.sourceId)).toEqual(['one'])
    expect(filterVisionLibrarySources(sources, { sortMode: 'name' }).map((item) => item.fileName)).toEqual(['episode-2.mp4', 'episode-10.mp4', 'trailer.mp4'])
    expect(filterVisionLibrarySources(sources, { sortMode: 'frames' }).map((item) => item.sourceId)).toEqual(['two', 'one', 'three'])
  })
})
