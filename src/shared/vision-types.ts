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
  message: string
}

export type VisionIndexRequest = {
  mediaPaths: string[]
  intervalSeconds?: number
}

export type VisionIndexProgress = {
  status: VisionIndexStatus
  totalVideos: number
  currentVideoIndex: number
  totalFrames: number
  processedFrames: number
  currentVideoPath?: string
  message?: string
  error?: string
}

export type VisionSearchRequest = {
  query?: string
  imagePath?: string
  limit?: number
}

export type VisionSearchResult = {
  id: string
  videoPath: string
  fileName: string
  timestampSeconds: number
  thumbnailPath: string
  score: number
  modelId: string
  modelVariant: string
}
