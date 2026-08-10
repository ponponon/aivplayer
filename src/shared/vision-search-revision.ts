import type { SpeakerDiarizationCatalog } from './speaker-diarization-catalog-types'
import type { VisionEntityCatalog } from './vision-entity-types'

export const VISION_SEARCH_REVISION_SCHEMA_VERSION = 1

export type VisionSearchTableName = 'video_frames' | 'video_sources' | 'video_captions' | 'video_search_documents' | 'video_evidence'

export type VisionSearchCatalogSnapshot = {
  entity: VisionEntityCatalog
  speaker: SpeakerDiarizationCatalog
}

export type VisionSearchRevision = {
  schemaVersion: typeof VISION_SEARCH_REVISION_SCHEMA_VERSION
  tables: Record<VisionSearchTableName, number | null>
  catalogs?: VisionSearchCatalogSnapshot
  fingerprint: string
}

export function getVisionSearchRevisionBody(revision: Pick<VisionSearchRevision, 'schemaVersion' | 'tables' | 'catalogs'>): Omit<VisionSearchRevision, 'fingerprint'> {
  return {
    schemaVersion: revision.schemaVersion,
    tables: revision.tables,
    ...(revision.catalogs ? { catalogs: revision.catalogs } : {})
  }
}
