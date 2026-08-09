import { createVisionEvidenceId, normalizeVisionTimeRange } from './vision-evidence'
import type { SpeakerDiarizationSegment } from '../../shared/speaker-diarization-types'
import type { VisionEvidence } from '../../shared/vision-types'

export const SPEAKER_DIARIZATION_EVIDENCE_MODEL_ID = 'sherpa-onnx-speaker-diarization'
export const SPEAKER_DIARIZATION_EVIDENCE_MODEL_VARIANT = '1.13.4'

export type SpeakerDiarizationEvidenceInput = {
  sourceId: string
  videoPath: string
  fileName: string
  sourceFingerprint: string
  durationSeconds: number
  segments: readonly SpeakerDiarizationSegment[]
  generatedAt?: number
}

function speakerText(speakerId: number): string {
  const displayId = speakerId + 1
  return `说话人 ${displayId} / Speaker ${displayId}`
}

/** Converts local diarization output into searchable, source-anchored evidence. */
export function createSpeakerDiarizationEvidence(input: SpeakerDiarizationEvidenceInput): VisionEvidence[] {
  const generatedAt = Number.isFinite(input.generatedAt) ? input.generatedAt : Date.now()
  const evidence: VisionEvidence[] = []
  for (const segment of input.segments) {
    if (!Number.isInteger(segment.speakerId) || segment.speakerId < 0) continue
    const range = normalizeVisionTimeRange({ startSeconds: segment.startSeconds, endSeconds: segment.endSeconds }, input.durationSeconds)
    if (!range) continue
    const text = speakerText(segment.speakerId)
    evidence.push({
      id: createVisionEvidenceId({
        videoPath: input.videoPath,
        evidenceType: 'speaker',
        startSeconds: range.startSeconds,
        endSeconds: range.endSeconds,
        text,
        sourceFingerprint: input.sourceFingerprint
      }),
      sourceId: input.sourceId,
      videoPath: input.videoPath,
      fileName: input.fileName,
      evidenceType: 'speaker',
      startSeconds: range.startSeconds,
      endSeconds: range.endSeconds,
      text,
      sourceFingerprint: input.sourceFingerprint,
      modelId: SPEAKER_DIARIZATION_EVIDENCE_MODEL_ID,
      modelVariant: SPEAKER_DIARIZATION_EVIDENCE_MODEL_VARIANT,
      generatedAt
    })
  }
  return evidence
}
