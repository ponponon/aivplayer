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
