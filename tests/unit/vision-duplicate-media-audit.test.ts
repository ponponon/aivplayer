import { describe, expect, it } from 'vitest'
import { createVisionDuplicateMediaAuditManifest, serializeVisionDuplicateMediaAudit } from '../../src/core/ai/vision-duplicate-media-audit'
import type { VisionDuplicateMediaScanResult } from '../../src/shared/vision-types'

const result: VisionDuplicateMediaScanResult = {
  status: 'completed',
  scannedCount: 2,
  hashedCount: 2,
  cachedCount: 0,
  unavailableCount: 0,
  skippedBySizeCount: 0,
  groups: [{
    id: 'duplicate-group',
    totalBytes: 300,
    duplicateBytes: 150,
    sources: [
      { sourceId: 'keep', videoPath: '/media/keep.mp4', fileName: 'keep.mp4', fileSizeBytes: 150, fileMtimeMs: 2, frameCount: 1, indexedAtMs: 1, subtitlePath: null, thumbnailPath: null, metadata: null },
      { sourceId: 'copy', videoPath: '/media/copy.mp4', fileName: 'copy.mp4', fileSizeBytes: 150, fileMtimeMs: 3, frameCount: 1, indexedAtMs: 1, subtitlePath: null, thumbnailPath: null, metadata: null }
    ]
  }]
}

describe('vision duplicate media audit', () => {
  it('exports a deterministic review manifest with the preferred source', () => {
    expect(createVisionDuplicateMediaAuditManifest(result, 123)).toEqual({
      exportVersion: 1,
      type: 'exact-duplicate-review',
      createdAtMs: 123,
      groups: [{
        id: 'duplicate-group',
        duplicateBytes: 150,
        recommendedSourceId: 'keep',
        sources: [
          { sourceId: 'keep', fileName: 'keep.mp4', videoPath: '/media/keep.mp4', fileSizeBytes: 150, fileMtimeMs: 2, recommendedKeep: true },
          { sourceId: 'copy', fileName: 'copy.mp4', videoPath: '/media/copy.mp4', fileSizeBytes: 150, fileMtimeMs: 3, recommendedKeep: false }
        ]
      }]
    })
  })

  it('does not emit destructive operation fields', () => {
    const manifest = JSON.parse(serializeVisionDuplicateMediaAudit(result, 123)) as Record<string, unknown>
    expect(manifest).not.toHaveProperty('delete')
    expect(manifest).not.toHaveProperty('move')
    expect(manifest).toMatchObject({ type: 'exact-duplicate-review', createdAtMs: 123 })
  })
})
