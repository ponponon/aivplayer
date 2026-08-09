import { describe, expect, it } from 'vitest'
import { mergeVisionLibrarySourceMetadata } from '../../src/core/ai/vision-library-source-metadata'
import type { MediaImportInboxItem } from '../../src/shared/media-import-inbox'
import type { VisionLibrarySource } from '../../src/shared/vision-types'

const source = (videoPath: string): VisionLibrarySource => ({
  sourceId: 'source-1', videoPath, fileName: 'demo.mp4', fileSizeBytes: 1, fileMtimeMs: 2, frameCount: 3, indexedAtMs: 4, subtitlePath: null, thumbnailPath: null, metadata: null
})

const item = (path: string): MediaImportInboxItem => ({
  path, fileName: 'demo.mp4', directoryPath: '/media', sizeBytes: 1, mtimeMs: 2, id: 'item-1', status: 'ready', discoveredAt: 1, updatedAt: 2,
  metadata: { tags: ['动作'], favorite: true, note: '重点素材', source: '测试项目', projectId: 'project-1' },
  pipeline: { metadata: 'ready', subtitle: 'skipped', vision: 'ready' }
})

describe('vision library source metadata', () => {
  it('joins inbox metadata by normalized media path and keeps unmatched sources null', () => {
    const merged = mergeVisionLibrarySourceMetadata([source('/media/demo.mp4'), source('/media/other.mp4')], [item('/media/./demo.mp4')])
    expect(merged[0]?.metadata).toEqual(item('/media/demo.mp4').metadata)
    expect(merged[1]?.metadata).toBeNull()
  })
})
