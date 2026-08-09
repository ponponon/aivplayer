import { describe, expect, it } from 'vitest'
import { createSpeakerDiarizationEvidence, SPEAKER_DIARIZATION_EVIDENCE_MODEL_ID, SPEAKER_DIARIZATION_EVIDENCE_MODEL_VARIANT } from '../../src/core/ai/speaker-diarization-evidence'

describe('speaker diarization evidence', () => {
  it('creates bilingual searchable evidence with source-anchored ranges', () => {
    const evidence = createSpeakerDiarizationEvidence({
      sourceId: 'source-demo',
      videoPath: '/videos/demo.mp4',
      fileName: 'demo.mp4',
      sourceFingerprint: '/videos/demo.mp4:100:200',
      durationSeconds: 12,
      generatedAt: 1000,
      segments: [
        { startSeconds: -1, endSeconds: 2, speakerId: 0 },
        { startSeconds: 4, endSeconds: 20, speakerId: 2 },
        { startSeconds: 5, endSeconds: 5, speakerId: 1 },
        { startSeconds: 6, endSeconds: 8, speakerId: -1 }
      ]
    })

    expect(evidence).toEqual([
      expect.objectContaining({
        evidenceType: 'speaker',
        startSeconds: 0,
        endSeconds: 2,
        text: '说话人 1 / Speaker 1',
        modelId: SPEAKER_DIARIZATION_EVIDENCE_MODEL_ID,
        modelVariant: SPEAKER_DIARIZATION_EVIDENCE_MODEL_VARIANT,
        sourceFingerprint: '/videos/demo.mp4:100:200',
        generatedAt: 1000
      }),
      expect.objectContaining({
        evidenceType: 'speaker',
        startSeconds: 4,
        endSeconds: 12,
        text: '说话人 3 / Speaker 3'
      })
    ])
  })

  it('keeps evidence ids deterministic for the same source segment', () => {
    const input = {
      sourceId: 'source-demo',
      videoPath: '/videos/demo.mp4',
      fileName: 'demo.mp4',
      sourceFingerprint: 'fingerprint',
      durationSeconds: 10,
      segments: [{ startSeconds: 1.23456, endSeconds: 2.34567, speakerId: 1 }]
    }

    expect(createSpeakerDiarizationEvidence(input)[0]?.id).toBe(createSpeakerDiarizationEvidence(input)[0]?.id)
  })
})
