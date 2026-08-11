export type VisionObjectDetectionPlatformId =
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'linux-arm64'
  | 'linux-x64'
  | 'win32-arm64'
  | 'win32-x64'
  | 'unsupported'

export type VisionObjectDetectionProviderId = 'transformers-object-detection'

export type VisionObjectDetectionModelFileKind = 'config' | 'preprocessor' | 'onnx' | 'license'

export type VisionObjectDetectionModelFile = {
  relativePath: string
  kind: VisionObjectDetectionModelFileKind
}

export type VisionObjectDetectionPlatformCapability = {
  platform: VisionObjectDetectionPlatformId
  supported: boolean
  runtimeId: string
  reason: string
}

export type VisionObjectDetectionModelFileStatus = VisionObjectDetectionModelFile & {
  path: string
  available: boolean
}

export type VisionObjectDetectionModelStatus = {
  available: boolean
  modelFilesAvailable: boolean
  providerId: VisionObjectDetectionProviderId
  modelId: string
  modelVersion: string
  modelDirectory: string
  platform: VisionObjectDetectionPlatformCapability
  files: VisionObjectDetectionModelFileStatus[]
  missingFiles: string[]
  message: string
}

export type VisionObjectDetectionBox = {
  xmin: number
  ymin: number
  xmax: number
  ymax: number
}

export type VisionObjectDetection = {
  label: string
  score: number
  box: VisionObjectDetectionBox
}

export type VisionObjectDetectionResult = {
  providerId: VisionObjectDetectionProviderId
  modelId: string
  modelVersion: string
  imagePath: string
  threshold: number
  detections: VisionObjectDetection[]
  generatedAt: number
}

export type VisionObjectDetectionFilterState = {
  labelQuery: string
  minimumScore: number
  categoryLabels: string[]
}

export type VisionObjectDetectionRequest = {
  imagePath: string
  threshold?: number
}

export type VisionObjectDetectionResponse = {
  success: boolean
  message: string
  status: VisionObjectDetectionModelStatus
  result: VisionObjectDetectionResult | null
}
