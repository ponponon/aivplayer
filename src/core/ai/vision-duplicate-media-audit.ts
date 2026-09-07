import type { VisionDuplicateMediaScanResult } from '../../shared/vision-types'

export type VisionDuplicateMediaAuditSource = {
  sourceId: string
  fileName: string
  videoPath: string
  fileSizeBytes: number
  fileMtimeMs: number
  recommendedKeep: boolean
}

export type VisionDuplicateMediaAuditGroup = {
  id: string
  duplicateBytes: number
  recommendedSourceId: string
  sources: VisionDuplicateMediaAuditSource[]
}

export type VisionDuplicateMediaAuditManifest = {
  exportVersion: 1
  type: 'exact-duplicate-review'
  createdAtMs: number
  groups: VisionDuplicateMediaAuditGroup[]
}

function normalizeNonNegativeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0
}

/** Creates a review-only manifest; it never encodes a delete or move operation. */
export function createVisionDuplicateMediaAuditManifest(result: VisionDuplicateMediaScanResult, createdAtMs = Date.now()): VisionDuplicateMediaAuditManifest {
  const groups = result.groups.map((group) => {
    const recommendedSourceId = group.sources[0]?.sourceId ?? ''
    return {
      id: group.id,
      duplicateBytes: normalizeNonNegativeNumber(group.duplicateBytes),
      recommendedSourceId,
      sources: group.sources.map((source, index) => ({
        sourceId: source.sourceId,
        fileName: source.fileName,
        videoPath: source.videoPath,
        fileSizeBytes: normalizeNonNegativeNumber(source.fileSizeBytes),
        fileMtimeMs: normalizeNonNegativeNumber(source.fileMtimeMs),
        recommendedKeep: index === 0
      }))
    }
  })
  return { exportVersion: 1, type: 'exact-duplicate-review', createdAtMs: Number.isFinite(createdAtMs) ? createdAtMs : Date.now(), groups }
}

export function serializeVisionDuplicateMediaAudit(result: VisionDuplicateMediaScanResult, createdAtMs?: number): string {
  return `${JSON.stringify(createVisionDuplicateMediaAuditManifest(result, createdAtMs), null, 2)}\n`
}
