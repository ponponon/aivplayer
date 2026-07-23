export const VISION_MODEL_ID = 'siglip2-base-patch16-224-ONNX'
export const VISION_MODEL_VARIANT = 'uint8'
export const VISION_FRAME_INTERVAL_SECONDS = 3

export type VisionIndexStatus = 'idle' | 'loading' | 'indexing' | 'completed' | 'cancelled' | 'error'

export type VisionRuntimeStatus = {
  available: boolean
  modelId: string
  modelVariant: string
  modelDirectory: string
  indexDirectory: string
  indexedFrameCount: number
  indexedVideoCount: number
  message: string
}

export type VisionIndexRequest = {
  mediaPaths: string[]
  intervalSeconds?: number
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
  totalVideos: number
  currentVideoIndex: number
  totalFrames: number
  processedFrames: number
  skippedVideos: number
  captionOnlyVideos: number
  currentVideoPath?: string
  message?: string
  error?: string
}

export type VisionSearchMode = 'visual' | 'hybrid'

export type VisionSearchRequest = {
  query?: string
  imagePath?: string
  limit?: number
  mode?: VisionSearchMode
}

export type VisionMatchSource = 'visual' | 'subtitle' | 'filename' | 'both'

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
  modelId: string
  modelVariant: string
}
