import { describe, expect, it } from 'vitest'
import { createVisionSceneEvidence } from '../../src/core/ai/vision-scene-evidence'

const baseInput = {
  sourceId: 'source-1',
  videoPath: '/media/demo.mp4',
  fileName: 'demo.mp4',
  sourceFingerprint: '/media/demo.mp4:100:20',
  durationSeconds: 12,
  frames: [
    { id: 'frame-0', timestampSeconds: 0, thumbnailPath: '/thumb/0.jpg' },
    { id: 'frame-1', timestampSeconds: 5, thumbnailPath: '/thumb/1.jpg' },
    { id: 'frame-2', timestampSeconds: 10, thumbnailPath: '/thumb/2.jpg' }
  ],
  generatedAt: 123
}

describe('vision scene evidence', () => {
  it('turns cuts into bounded source ranges and anchors each range to its nearest frame', () => {
    const evidence = createVisionSceneEvidence({ ...baseInput, cutTimestamps: [5, 5.04, -1, 20, 2] })

    expect(evidence).toHaveLength(3)
    expect(evidence.map((item) => [item.startSeconds, item.endSeconds])).toEqual([[0, 2], [2, 5], [5, 12]])
    expect(evidence.map((item) => item.frameId)).toEqual(['frame-0', 'frame-1', 'frame-2'])
    expect(evidence[0]).toMatchObject({ evidenceType: 'scene', modelId: 'ffmpeg-scene-detection', modelVariant: 'scene-cut-v1', generatedAt: 123 })
    expect(evidence[1]?.text).toContain('scene change')
  })

  it('creates one searchable segment when a video has no detected cuts', () => {
    const evidence = createVisionSceneEvidence({ ...baseInput, cutTimestamps: [] })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ startSeconds: 0, endSeconds: 12, frameId: 'frame-1' })
    expect(evidence[0]?.text).toContain('scene segment')
  })

  it('keeps evidence IDs stable for the same source and changes them with the fingerprint', () => {
    const first = createVisionSceneEvidence({ ...baseInput, cutTimestamps: [4] })
    const second = createVisionSceneEvidence({ ...baseInput, cutTimestamps: [4] })
    const changed = createVisionSceneEvidence({ ...baseInput, sourceFingerprint: 'changed', cutTimestamps: [4] })

    expect(first.map((item) => item.id)).toEqual(second.map((item) => item.id))
    expect(first.map((item) => item.id)).not.toEqual(changed.map((item) => item.id))
  })

  it('does not create ranges for invalid durations', () => {
    expect(createVisionSceneEvidence({ ...baseInput, durationSeconds: 0, cutTimestamps: [1] })).toEqual([])
  })
})
