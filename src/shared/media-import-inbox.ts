export const MEDIA_IMPORT_INBOX_SCHEMA_VERSION = 1

export type MediaImportInboxMetadata = {
  tags: string[]
  favorite: boolean
  note: string
  source: string | null
  projectId: string | null
}

export type MediaImportInboxMetadataPatch = Partial<MediaImportInboxMetadata>

export type MediaImportInboxStatus = 'discovered' | 'queued' | 'processing' | 'ready' | 'ignored' | 'failed' | 'missing'

export type MediaImportInboxPipelineStage = 'pending' | 'processing' | 'ready' | 'skipped' | 'failed'

export type MediaImportInboxPipeline = {
  metadata: MediaImportInboxPipelineStage
  subtitle: MediaImportInboxPipelineStage
  vision: MediaImportInboxPipelineStage
}

export type MediaImportInboxTransitionStatus = 'discovered' | 'queued' | 'ignored' | 'failed'

export type MediaImportInboxPipelineProgress = {
  itemId: string
  stage: 'metadata' | 'subtitle' | 'vision'
  status: MediaImportInboxPipelineStage
  progress?: import('./vision-types').VisionIndexProgress
  message?: string
}

export type MediaImportInboxFile = {
  path: string
  fileName: string
  directoryPath: string
  sizeBytes: number
  mtimeMs: number
}

export type MediaImportInboxItem = MediaImportInboxFile & {
  id: string
  status: MediaImportInboxStatus
  discoveredAt: number
  updatedAt: number
  metadata: MediaImportInboxMetadata
  pipeline: MediaImportInboxPipeline
  lastError?: string
}

export type MediaImportInboxManifest = {
  schemaVersion: number
  items: MediaImportInboxItem[]
}

export type MediaImportInboxScanStatus = 'scanning' | 'completed' | 'cancelled' | 'error'

export type MediaImportInboxScanProgress = {
  status: MediaImportInboxScanStatus
  directoriesScanned: number
  discoveredVideos: number
  failedDirectories: number
  currentDirectoryPath?: string
  currentPath?: string
  message?: string
  error?: string
}

export type MediaImportInboxScanResult = {
  status: 'completed' | 'cancelled'
  files: MediaImportInboxFile[]
  scannedDirectories: string[]
  directoriesScanned: number
  discoveredVideos: number
  failedDirectories: number
  truncated: boolean
}

export type MediaImportInboxScanRequest = {
  directories: string[]
  recursive: boolean
}

export type MediaImportInboxScanResponse = {
  result: MediaImportInboxScanResult
  items: MediaImportInboxItem[]
}

export type MediaImportInboxTransitionRequest = {
  itemId: string
  status: MediaImportInboxTransitionStatus
  error?: string
}

export type MediaImportInboxBatchAction = 'queue' | 'ignore' | 'retry' | 'clear'

export type MediaImportInboxBatchTransitionRequest = {
  itemIds: string[]
  action: MediaImportInboxBatchAction
}

export type MediaImportInboxMetadataUpdateRequest = {
  itemId: string
  patch: MediaImportInboxMetadataPatch
  writeSidecar: boolean
}

export type MediaImportInboxWatchRequest = {
  directories: string[]
  recursive: boolean
}

export type MediaImportInboxWatchStartResult = {
  directories: string[]
  watchedDirectories: string[]
}

export type MediaImportInboxDirectoriesChangedEvent = {
  directories: string[]
}
