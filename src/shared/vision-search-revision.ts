export const VISION_SEARCH_REVISION_SCHEMA_VERSION = 1

export type VisionSearchTableName = 'video_frames' | 'video_sources' | 'video_captions' | 'video_search_documents' | 'video_evidence'

export type VisionSearchRevision = {
  schemaVersion: typeof VISION_SEARCH_REVISION_SCHEMA_VERSION
  tables: Record<VisionSearchTableName, number | null>
  fingerprint: string
}
