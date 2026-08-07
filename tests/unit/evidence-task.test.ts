import { describe, expect, it } from 'vitest'
import {
  cancelMediaEvidenceTask,
  completeMediaEvidenceTask,
  createMediaEvidenceTask,
  failMediaEvidenceTask,
  retryMediaEvidenceTask,
  startMediaEvidenceTask,
  toVisionOcrEvidence,
  updateMediaEvidenceTaskProgress
} from '../../src/core/ai/evidence-task'

describe('media evidence task state', () => {
  it('creates a deterministic queued task with normalized ranges and retry policy', () => {
    const input = { kind: 'ocr' as const, mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'frames:1', ranges: [{ startSeconds: 2.12345, endSeconds: 3.9 }, { startSeconds: 2.1234, endSeconds: 3.9001 }, { startSeconds: 4, endSeconds: 4 }], maxRetries: 8 }
    const first = createMediaEvidenceTask(input, 100)
    const second = createMediaEvidenceTask(input, 100)

    expect(first).toEqual(second)
    expect(first).toMatchObject({ status: 'queued', attempts: 0, maxRetries: 3, createdAt: 100, updatedAt: 100 })
    expect(first.ranges).toEqual([{ startSeconds: 2.123, endSeconds: 3.9 }])
  })

  it('moves through progress, retry, and completion without mutating previous states', () => {
    const queued = createMediaEvidenceTask({ kind: 'ocr', mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'frames:1', maxRetries: 2 }, 100)
    const running = startMediaEvidenceTask(queued, 110)
    const progress = updateMediaEvidenceTaskProgress(running, 0.45, 120)
    const retrying = failMediaEvidenceTask(progress, 'temporary OCR error', 130)
    const queuedAgain = retryMediaEvidenceTask(retrying, 140)
    const runningAgain = startMediaEvidenceTask(queuedAgain, 150)
    const completed = completeMediaEvidenceTask(runningAgain, [{ id: 'ocr-1', artifactType: 'ocr-evidence', sourceFingerprint: 'video:1', startSeconds: 1, endSeconds: 2, text: '画面文字', confidence: 1.4 }], 160)

    expect(queued.status).toBe('queued')
    expect(progress).toMatchObject({ status: 'running', progress: 0.45, attempts: 1 })
    expect(retrying).toMatchObject({ status: 'retrying', attempts: 1, error: 'temporary OCR error' })
    expect(queuedAgain).toMatchObject({ status: 'queued', progress: 0, attempts: 1 })
    expect(completed).toMatchObject({ status: 'completed', progress: 1, attempts: 2 })
    expect(completed.artifacts[0]).toMatchObject({ text: '画面文字', confidence: 1 })
  })

  it('does not promote stale or invalid artifacts into the task result', () => {
    const running = startMediaEvidenceTask(createMediaEvidenceTask({ kind: 'tts', mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'tts:1' }, 100), 110)
    const completed = completeMediaEvidenceTask(running, [
      { id: 'wrong-source', artifactType: 'tts-audio', sourceFingerprint: 'video:2', startSeconds: 0, endSeconds: 1, text: 'stale' },
      { id: 'empty', artifactType: 'tts-audio', sourceFingerprint: 'video:1', startSeconds: 0, endSeconds: 1, text: '   ' },
      { id: 'valid', artifactType: 'tts-audio', sourceFingerprint: 'video:1', startSeconds: 0, endSeconds: 1, text: '朗读内容', audioPath: ' /tmp/derived.wav ' }
    ], 120)

    expect(completed.artifacts).toEqual([expect.objectContaining({ id: 'valid', audioPath: '/tmp/derived.wav' })])
  })

  it('fails permanently after retry budget and cancels active work without artifacts', () => {
    const queued = createMediaEvidenceTask({ kind: 'ocr', mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'frames:1', maxRetries: 0 }, 100)
    const running = startMediaEvidenceTask(queued, 110)
    const failed = failMediaEvidenceTask(running, 'permanent failure', 120)
    const cancelled = cancelMediaEvidenceTask(startMediaEvidenceTask(createMediaEvidenceTask({ kind: 'tts', mediaPath: '/tmp/video.mp4', sourceFingerprint: 'video:1', inputHash: 'tts:1' }, 200), 210), 220)

    expect(failed).toMatchObject({ status: 'failed', error: 'permanent failure' })
    expect(cancelled).toMatchObject({ status: 'cancelled', artifacts: [] })
  })

  it('promotes OCR artifacts to searchable vision evidence without changing subtitle data', () => {
    const evidence = toVisionOcrEvidence({ id: 'ocr-1', artifactType: 'ocr-evidence', sourceFingerprint: 'video:1', startSeconds: 1, endSeconds: 2, text: '画面文字', frameId: 'frame-1', confidence: 0.8 }, { sourceId: 'source-1', videoPath: '/tmp/video.mp4', fileName: 'video.mp4', modelId: 'ocr-test', modelVariant: 'v1', generatedAt: 123 })

    expect(evidence).toMatchObject({ id: 'ocr-1', evidenceType: 'ocr', sourceId: 'source-1', text: '画面文字', frameId: 'frame-1', confidence: 0.8 })
  })
})
