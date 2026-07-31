export type PersonMatteModelStatus = {
  available: boolean
  modelId: string
  modelDirectory: string
  message: string
}

export type PersonMatteModelDownloadStatus = 'cached' | 'downloading' | 'completed'

export type PersonMatteModelDownloadProgress = {
  status: PersonMatteModelDownloadStatus
  relativePath: string
  fileIndex: number
  fileCount: number
  receivedBytes: number
  totalBytes: number | null
  percent: number | null
}

export type PersonMatteModelDownloadResult = {
  success: boolean
  message: string
  status: PersonMatteModelStatus
}

export type PersonMatteTrackRequest = {
  sourcePath: string
  sourceFingerprint: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  sampleFps?: number
}

export type PersonMatteTrackFrame = {
  sourceSeconds: number
  url: string
}

export type PersonMatteTrackProgress = {
  status: 'cached' | 'processing'
  processedFrames: number
  totalFrames: number
}

export type PersonMatteTrackResult = {
  success: boolean
  message: string
  sourceFingerprint: string
  sourceStartSeconds: number
  sourceEndSeconds: number
  sampleFps: number
  frames: PersonMatteTrackFrame[]
}
