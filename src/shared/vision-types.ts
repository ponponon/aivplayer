import type { VisionObjectDetectionBox, VisionObjectDetectionFilterState } from './vision-object-detection-types'

export const VISION_MODEL_ID = 'siglip2-base-patch16-224-ONNX'
export const VISION_MODEL_VARIANT = 'uint8'
export const VISION_MODEL_REPOSITORY = 'onnx-community/siglip2-base-patch16-224-ONNX'
export const VISION_MODEL_REVISION = 'ba1f3b0843f24bc5417d38e19c37b287d719b2f4'
export const VISION_MODEL_BASE_URL = `https://releases.quniv.cn/aivplayer/models/siglip2/${VISION_MODEL_REVISION}`
export const VISION_MODEL_FILES = [
  'config.json',
  'preprocessor_config.json',
  'quantize_config.json',
  'special_tokens_map.json',
  'tokenizer.json',
  'tokenizer.model',
  'tokenizer_config.json',
  'onnx/text_model_uint8.onnx',
  'onnx/vision_model_uint8.onnx'
] as const
export const VISION_FRAME_INTERVAL_SECONDS = 3
export const VISION_VECTOR_INDEX_TYPE = 'IVF_FLAT'
export const VISION_VECTOR_DISTANCE_TYPE = 'dot'
export const VISION_VECTOR_INDEX_MIN_ROWS = 10_000
export const VISION_SEARCH_FULL_EXPORT_MAX_RESULTS = 1_000_000

export type VisionIndexStatus = 'idle' | 'loading' | 'indexing' | 'completed' | 'cancelled' | 'error'

export type VisionIndexStage = 'planning' | 'loading-model' | 'frames' | 'scene-evidence' | 'entity-evidence' | 'object-evidence' | 'vector-index' | 'text-index' | 'completed' | 'cancelled' | 'error'

export type VisionIndexTimings = {
  planningMs: number
  modelLoadingMs: number
  framesMs: number
  sceneEvidenceMs: number
  entityEvidenceMs: number
  objectEvidenceMs: number
  vectorIndexMs: number
  textIndexMs: number
  totalMs: number
}

export type VisionRuntimeStatus = {
  available: boolean
  downloadable: boolean
  packAvailable: boolean
  packDownloadable: boolean
  packVersion: string
  packDirectory: string
  modelId: string
  modelVariant: string
  modelDirectory: string
  indexDirectory: string
  indexedFrameCount: number
  indexedVideoCount: number
  vectorIndexType: string | null
  vectorIndexDistanceType: string | null
  vectorIndexIndexedRows: number
  vectorIndexUnindexedRows: number
  message: string
}

export type VisionModelDownloadStatus = 'cached' | 'downloading' | 'completed'

export type VisionModelDownloadProgress = {
  status: VisionModelDownloadStatus
  relativePath: string
  fileIndex: number
  fileCount: number
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
}

export type VisionModelDownloadResult = {
  success: boolean
  message: string
  status: VisionRuntimeStatus
}

export type VisionPackDownloadResult = {
  success: boolean
  message: string
  status: VisionRuntimeStatus
}

export type VisionLibrarySourceRequest = {
  limit?: number
  offset?: number
}

export type VisionLibrarySourceMetadata = {
  tags: string[]
  favorite: boolean
  note: string
  source: string | null
  projectId: string | null
}

export type VisionLibrarySource = {
  sourceId: string
  videoPath: string
  fileName: string
  fileSizeBytes: number
  fileMtimeMs: number
  frameCount: number
  indexedAtMs: number
  subtitlePath: string | null
  thumbnailPath: string | null
  metadata: VisionLibrarySourceMetadata | null
}

export type VisionIndexRequest = {
  mediaPaths: string[]
  intervalSeconds?: number
  includeSceneEvidence?: boolean
  includeEntityEvidence?: boolean
  includeObjectEvidence?: boolean
}

export type VisionIndexOptions = {
  subtitlePaths?: ReadonlyMap<string, string>
  includeSceneEvidence?: boolean
  includeEntityEvidence?: boolean
  includeObjectEvidence?: boolean
}

export type VisionDirectoryScanRequest = {
  directoryPath: string
  recursive: boolean
}

export type VisionDirectoryScanStatus = 'scanning' | 'completed' | 'cancelled' | 'error'

export type VisionDirectoryScanProgress = {
  status: VisionDirectoryScanStatus
  directoryPath: string
  scannedDirectories: number
  discoveredVideos: number
  currentPath?: string
  message?: string
  error?: string
}

export type VisionDirectoryScanResult = {
  status: 'completed' | 'cancelled'
  directoryPath: string
  files: string[]
  scannedDirectories: number
  discoveredVideos: number
}

export type VisionDirectoryBatchScanProgress = {
  status: 'scanning' | 'completed' | 'cancelled'
  totalDirectories: number
  currentDirectoryIndex: number
  completedDirectories: number
  discoveredVideos: number
  failedDirectories: number
  currentDirectoryPath?: string
  currentPath?: string
}

export type VisionIndexProgress = {
  status: VisionIndexStatus
  stage: VisionIndexStage
  phaseElapsedMs?: number
  timings?: VisionIndexTimings
  totalVideos: number
  currentVideoIndex: number
  totalFrames: number
  processedFrames: number
  skippedVideos: number
  captionOnlyVideos: number
  sceneEvidenceTotal?: number
  sceneEvidenceProcessed?: number
  sceneEvidenceCount?: number
  entityEvidenceTotal?: number
  entityEvidenceProcessed?: number
  entityEvidenceCount?: number
  objectEvidenceTotal?: number
  objectEvidenceProcessed?: number
  objectEvidenceCount?: number
  currentVideoPath?: string
  failedStage?: VisionIndexStage
  message?: string
  error?: string
}

export type VisionIndexFailureRecord = {
  id: string
  mediaPath: string
  fileName: string
  error: string
  failedAt: number
  lastAttemptAt: number
  retryCount: number
  intervalSeconds: number
  includeSceneEvidence: boolean
  includeEntityEvidence: boolean
  includeObjectEvidence: boolean
  stage: VisionIndexStage
}

export type VisionIndexFailureRetryRequest = {
  id: string
}

export type VisionIndexFailureRetryBatchRequest = {
  ids: string[]
}

export type VisionSearchMode = 'visual' | 'hybrid'

export type VisionEvidenceType = 'subtitle' | 'visual' | 'scene' | 'ocr' | 'entity' | 'object' | 'speaker'

export const VISION_DERIVED_EVIDENCE_TYPES = ['ocr', 'scene', 'entity', 'object', 'speaker'] as const

export type VisionDerivedEvidenceType = typeof VISION_DERIVED_EVIDENCE_TYPES[number]

export type VisionEvidenceCounts = Record<VisionDerivedEvidenceType, number>

export type VisionEvidenceSource = {
  videoPath: string
  fileName: string
  sourceFingerprint: string
  evidenceCounts: VisionEvidenceCounts
  generatedAt: number
}

export const VISION_EVIDENCE_AUDIT_STATUSES = ['current', 'changed', 'missing', 'unavailable'] as const

export type VisionEvidenceAuditStatus = typeof VISION_EVIDENCE_AUDIT_STATUSES[number]

export type VisionEvidenceSourceAudit = VisionEvidenceSource & {
  auditStatus: VisionEvidenceAuditStatus
  currentFingerprint?: string
}

export type VisionEvidenceAuditPage = {
  sources: VisionEvidenceSourceAudit[]
  offset: number
  limit: number
  hasMore: boolean
}

export type VisionEvidenceSourceRequest = {
  limit?: number
  offset?: number
  evidenceTypes?: VisionDerivedEvidenceType[]
}

export type VisionEvidenceAuditRequest = VisionEvidenceSourceRequest & {
  auditStatuses?: VisionEvidenceAuditStatus[]
}

export type VisionEvidenceClearTarget = {
  videoPath: string
  evidenceTypes: VisionDerivedEvidenceType[]
}

export type VisionEvidenceBatchClearRequest = {
  targets: VisionEvidenceClearTarget[]
}

export type VisionEvidenceBatchClearResult = {
  success: boolean
  message: string
  clearedSources: number
  clearedEvidenceCount: number
  clearedByType: VisionEvidenceCounts
}

export type VisionSearchSortMode = 'relevance' | 'source-time' | 'file-name'

export type VisionSavedSearch = {
  id: string
  name: string
  query: string
  mode: VisionSearchMode
  evidenceTypes: VisionEvidenceType[]
  objectDetectionFilter?: VisionObjectDetectionFilterState
  createdAt: number
  updatedAt: number
}

export type VisionSavedSearchInput = {
  id?: string
  name: string
  query: string
  mode?: VisionSearchMode
  evidenceTypes?: VisionEvidenceType[]
  objectDetectionFilter?: VisionObjectDetectionFilterState
}

export type VisionSavedSearchFileResult = {
  success: boolean
  message: string
  canceled?: boolean
  filePath?: string
  importedCount?: number
  skippedCount?: number
}

export type VisionSearchRequest = {
  query?: string
  imagePath?: string
  limit?: number
  mode?: VisionSearchMode
  evidenceTypes?: VisionEvidenceType[]
  objectDetectionFilter?: VisionObjectDetectionFilterState
}

export type VisionSearchPageKind = 'text' | 'image' | 'similar'

export type VisionSearchPageRequestBase = {
  cursor?: string
  offset?: number
}

export type VisionTextSearchPageRequest = VisionSearchPageRequestBase & {
  kind: 'text'
  request: VisionSearchRequest
}

export type VisionImageSearchPageRequest = VisionSearchPageRequestBase & {
  kind: 'image'
  request: VisionSearchRequest
}

export type VisionSimilarSearchPageRequest = VisionSearchPageRequestBase & {
  kind: 'similar'
  request: VisionSimilarSearchRequest
}

export type VisionSearchPageRequest = VisionTextSearchPageRequest | VisionImageSearchPageRequest | VisionSimilarSearchPageRequest

export type VisionSearchResultPage = {
  results: VisionSearchResult[]
  total: number
  offset: number
  limit: number
  hasMore: boolean
  cursor?: string
}

export type VisionSearchResultsExportFormat = 'json' | 'csv'

export type VisionSearchFullExportRequest =
  | { kind: 'text'; request: VisionSearchRequest; format: VisionSearchResultsExportFormat }
  | { kind: 'image'; request: VisionSearchRequest; format: VisionSearchResultsExportFormat }
  | { kind: 'similar'; request: VisionSimilarSearchRequest; format: VisionSearchResultsExportFormat }

export type VisionSearchResultsExportRequest = {
  results: VisionSearchResult[]
  format: VisionSearchResultsExportFormat
}

export type VisionSearchResultsExportResult = {
  success: boolean
  message: string
  filePath?: string
  canceled?: boolean
  taskId?: string
}

export type VisionSimilarSearchRequest = {
  resultId?: string
  frameId?: string
  videoPath: string
  timestampSeconds: number
  thumbnailPath?: string
  limit?: number
}

export type VisionMatchSource = 'visual' | 'subtitle' | 'filename' | 'both'

/** A searchable fact anchored to a source-media time range. */
export type VisionEvidence = {
  id: string
  sourceId: string
  videoPath: string
  fileName: string
  evidenceType: VisionEvidenceType
  startSeconds: number
  endSeconds: number
  text?: string
  frameId?: string
  thumbnailPath?: string
  confidence?: number
  box?: VisionObjectDetectionBox
  sourceFingerprint?: string
  modelId?: string
  modelVariant?: string
  generatedAt?: number
}

export type VisionClipSelection = {
  sourceId: string
  videoPath: string
  fileName: string
  fingerprint: string
  durationSeconds: number
  width?: number
  height?: number
  startSeconds: number
  endSeconds: number
  evidenceIds: string[]
  text?: string
  evidenceTypes: VisionEvidenceType[]
}

export type VisionClipCollection = {
  id: string
  title: string
  tags: string[]
  sortMode: VisionClipCollectionSortMode
  createdAt: number
  updatedAt: number
  selections: VisionClipSelection[]
}

export type VisionClipCollectionSortMode = 'source-time' | 'duration-desc' | 'file-name'

export type VisionClipCollectionInput = {
  id?: string
  title: string
  tags?: string[]
  sortMode?: VisionClipCollectionSortMode
  selections: VisionClipSelection[]
}

export type VisionClipCollectionExportFormat = 'json' | 'csv' | 'edl'

export type VisionClipCollectionExportRequest = {
  collectionId: string
  format: VisionClipCollectionExportFormat
}

export type VisionClipCollectionBatchDeleteRequest = {
  collectionIds: string[]
}

export type VisionClipCollectionBatchDeleteResult = {
  deletedIds: string[]
  deletedCount: number
  skippedCount: number
}

export type VisionClipCollectionBatchRenameRequest = {
  collectionIds: string[]
  prefix?: string
  suffix?: string
}

export type VisionClipCollectionBatchRenameResult = {
  success: boolean
  message: string
  collections: VisionClipCollection[]
  skippedCount: number
}

export type VisionClipCollectionBatchTagsRequest = {
  collectionIds: string[]
  tags?: string[]
}

export type VisionClipCollectionBatchTagsResult = {
  success: boolean
  message: string
  collections: VisionClipCollection[]
  skippedCount: number
}

export type VisionClipCollectionBatchExportRequest = {
  collectionIds: string[]
}

export type VisionClipCollectionExportResult = {
  success: boolean
  message: string
  filePath?: string
  canceled?: boolean
}

export type VisionClipCollectionBatchExportResult = {
  success: boolean
  message: string
  filePath?: string
  canceled?: boolean
  exportedCount?: number
  skippedCount?: number
}

export type VisionClipCollectionImportResult = {
  success: boolean
  message: string
  filePath?: string
  canceled?: boolean
  collection?: VisionClipCollection
  collections?: VisionClipCollection[]
}

export type VisionClipCollectionBatchDuplicateRequest = {
  collectionIds: string[]
}

export type VisionClipCollectionBatchDuplicateResult = {
  collections: VisionClipCollection[]
  skippedCount: number
}

export type VisionSearchResult = {
  id: string
  videoPath: string
  fileName: string
  timestampSeconds: number
  thumbnailPath: string
  score: number
  visualScore?: number
  lexicalScore?: number
  matchedText?: string
  matchSource?: VisionMatchSource
  /** Stable evidence row that explains this result, when the evidence table exists. */
  evidenceId?: string
  /** Frame id remains separate from evidence id so multiple subtitle cues can share a frame. */
  frameId?: string
  sourceId?: string
  durationSeconds?: number
  startSeconds?: number
  endSeconds?: number
  evidenceType?: VisionEvidenceType
  confidence?: number
  box?: VisionObjectDetectionBox
  entityLabelId?: string
  sourceFingerprint?: string
  modelId: string
  modelVariant: string
}
