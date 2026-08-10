export type SpeakerDiarizationPlatformId =
  | 'darwin-arm64'
  | 'darwin-x64'
  | 'linux-arm64'
  | 'linux-x64'
  | 'win32-ia32'
  | 'win32-x64'
  | 'unsupported'

export type SpeakerDiarizationProviderId = 'sherpa-onnx'

export type SpeakerDiarizationModelId = 'sherpa-onnx-pyannote-3.0-3dspeaker-eres2net-zh-cn'

export type SpeakerDiarizationModelFileKind = 'segmentation' | 'embedding' | 'license'

export type SpeakerDiarizationModelFile = {
  relativePath: string
  kind: SpeakerDiarizationModelFileKind
}

export type SpeakerDiarizationPlatformCapability = {
  platform: SpeakerDiarizationPlatformId
  supported: boolean
  nativePackageId: string | null
  reason: string
}

export type SpeakerDiarizationModelFileStatus = SpeakerDiarizationModelFile & {
  path: string
  available: boolean
}

export type SpeakerDiarizationModelStatus = {
  available: boolean
  modelFilesAvailable: boolean
  providerId: SpeakerDiarizationProviderId
  modelId: SpeakerDiarizationModelId
  modelVersion: string
  modelDirectory: string
  platform: SpeakerDiarizationPlatformCapability
  files: SpeakerDiarizationModelFileStatus[]
  missingFiles: string[]
  message: string
}

export type SpeakerDiarizationSegment = {
  startSeconds: number
  endSeconds: number
  speakerId: number
}

export type SpeakerDiarizationResult = {
  sampleRate: number
  durationSeconds: number
  segments: SpeakerDiarizationSegment[]
}

export type SpeakerDiarizationRunRequest = {
  mediaPath: string
  numClusters?: number
  threshold?: number
  minDurationOn?: number
  minDurationOff?: number
}

export type SpeakerDiarizationRunResult = {
  success: boolean
  message: string
  status: SpeakerDiarizationModelStatus
  result: SpeakerDiarizationResult | null
  evidencePersisted: boolean
  evidenceCount: number
  sourceFingerprint?: string
  evidenceMessage?: string
}

export type SpeakerDiarizationEvidenceClearResult = {
  success: boolean
  message: string
}

export type SpeakerDiarizationEvidenceSource = {
  videoPath: string
  fileName: string
  sourceFingerprint: string
  evidenceCount: number
  generatedAt: number
}

export type SpeakerDiarizationEvidenceBatchClearResult = {
  success: boolean
  message: string
  clearedSources: number
  clearedEvidenceCount: number
}
