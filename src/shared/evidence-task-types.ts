export type MediaEvidenceTaskKind = 'ocr' | 'tts'
export type MediaEvidenceTaskStatus = 'queued' | 'running' | 'retrying' | 'completed' | 'failed' | 'cancelled'
export type MediaEvidencePersistenceStatus = 'persisted' | 'skipped-stale' | 'failed' | 'not-applicable'

export type MediaEvidenceTaskRequest = {
  kind: MediaEvidenceTaskKind
  mediaPath: string
  inputHash: string
  inputText?: string
  ranges?: MediaEvidenceRange[]
  maxRetries?: number
}

export type MediaEvidenceEngineCapability = {
  available: boolean
  command: string
  message: string
}

export type MediaEvidenceCapabilities = {
  ocr: MediaEvidenceEngineCapability
  tts: MediaEvidenceEngineCapability
}

export type MediaEvidenceRange = {
  startSeconds: number
  endSeconds: number
}

export type OcrEvidenceArtifact = {
  id: string
  artifactType: 'ocr-evidence'
  sourceFingerprint: string
  startSeconds: number
  endSeconds: number
  text: string
  confidence?: number
  frameId?: string
}

export type TtsAudioArtifact = {
  id: string
  artifactType: 'tts-audio'
  sourceFingerprint: string
  startSeconds: number
  endSeconds: number
  text: string
  audioPath?: string
  mimeType?: string
}

export type MediaEvidenceArtifact = OcrEvidenceArtifact | TtsAudioArtifact

export type MediaEvidenceTask = {
  id: string
  kind: MediaEvidenceTaskKind
  mediaPath: string
  sourceFingerprint: string
  inputHash: string
  inputText?: string
  ranges: MediaEvidenceRange[]
  status: MediaEvidenceTaskStatus
  progress: number
  attempts: number
  maxRetries: number
  artifacts: MediaEvidenceArtifact[]
  persistenceStatus?: MediaEvidencePersistenceStatus
  persistedArtifactCount?: number
  persistenceMessage?: string
  error?: string
  createdAt: number
  updatedAt: number
}

export type MediaEvidenceDraftCue = {
  startSeconds: number
  endSeconds: number
  text: string
}

export type MediaEvidenceDraftSaveRequest = {
  mediaPath: string
  sourceFingerprint: string
  cues?: MediaEvidenceDraftCue[]
  startSeconds?: number
  endSeconds?: number
  text?: string
}

export type MediaEvidenceDraft = {
  id: string
  mediaPath: string
  sourceFingerprint: string
  cues: MediaEvidenceDraftCue[]
  startSeconds: number
  endSeconds: number
  text: string
  draftPath: string
  draftUrl: string
  createdAt: number
}

export type MediaEvidenceDraftImportRequest = {
  draftId: string
  mediaPath: string
  overwriteExisting: boolean
}

export type MediaEvidenceDraftImportResult = {
  success: boolean
  message: string
  requiresOverwriteConfirmation?: boolean
  existingSubtitlePaths?: string[]
  draft?: MediaEvidenceDraft
  subtitlePath?: string
  subtitleSrtPath?: string
  subtitleUrl?: string
  subtitleSrtUrl?: string
}
