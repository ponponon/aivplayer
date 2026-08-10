import { describe, expect, it } from 'vitest'
import { createVisionObjectDetectionEvidence } from '../../src/core/ai/vision-object-detection-evidence'

const baseInput = {
  sourceId: 'source-1',
  videoPath: '/media/demo.mp4',
  fileName: 'demo.mp4',
  sourceFingerprint: '/media/demo.mp4:10:20',
  frameId: 'frame-1',
  thumbnailPath: '/thumb/1.jpg',
  timestampSeconds: 5,
  intervalSeconds: 3,
  threshold: 0.5,
  generatedAt: 123
}

describe('vision object detection evidence', () => {
  it('converts thresholded detections into source-anchored evidence with boxes', () => {
    const evidence = createVisionObjectDetectionEvidence({
      ...baseInput,
      detections: [
        { label: ' person ', score: 0.9, box: { xmin: 10.1234, ymin: 20, xmax: 80, ymax: 90 } },
        { label: 'chair', score: 0.4, box: { xmin: 1, ymin: 2, xmax: 3, ymax: 4 } }
      ]
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({
      evidenceType: 'object',
      text: 'person',
      confidence: 0.9,
      box: { xmin: 10.123, ymin: 20, xmax: 80, ymax: 90 },
      startSeconds: 3.5,
      endSeconds: 6.5,
      frameId: 'frame-1',
      modelId: 'transformers-object-detection',
      generatedAt: 123
    })
  })

  it('keeps same-label detections distinct when their boxes differ', () => {
    const evidence = createVisionObjectDetectionEvidence({
      ...baseInput,
      detections: [
        { label: 'person', score: 0.8, box: { xmin: 1, ymin: 2, xmax: 10, ymax: 20 } },
        { label: 'person', score: 0.8, box: { xmin: 30, ymin: 2, xmax: 40, ymax: 20 } }
      ]
    })

    expect(evidence).toHaveLength(2)
    expect(new Set(evidence.map((item) => item.id)).size).toBe(2)
  })

  it('drops invalid boxes and invalid time ranges', () => {
    expect(createVisionObjectDetectionEvidence({
      ...baseInput,
      detections: [{ label: 'person', score: 0.9, box: { xmin: 10, ymin: 10, xmax: 5, ymax: 20 } }]
    })).toEqual([])
    expect(createVisionObjectDetectionEvidence({ ...baseInput, intervalSeconds: 0, detections: [] })).toEqual([])
  })
})
