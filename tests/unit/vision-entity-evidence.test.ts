import { describe, expect, it } from 'vitest'
import { createVisionEntityEvidence, DEFAULT_VISION_ENTITY_LABELS, selectVisionEntityLabels, type VisionEntityLabel } from '../../src/core/ai/vision-entity-evidence'

const labels: VisionEntityLabel[] = [
  { id: 'person', query: 'a person', displayName: '人物 / person' },
  { id: 'vehicle', query: 'a vehicle', displayName: '车辆 / vehicle' },
  { id: 'night', query: 'a night scene', displayName: '夜景 / night' }
]

describe('vision entity evidence', () => {
  it('includes a bounded frame-level object vocabulary without duplicate ids', () => {
    const objectLabels = DEFAULT_VISION_ENTITY_LABELS.filter((label) => label.id.startsWith('object-'))

    expect(objectLabels.map((label) => label.id)).toEqual([
      'object-backpack', 'object-bag', 'object-book', 'object-camera', 'object-computer',
      'object-phone', 'object-chair', 'object-table', 'object-screen', 'object-building'
    ])
    expect(new Set(DEFAULT_VISION_ENTITY_LABELS.map((label) => label.id)).size).toBe(DEFAULT_VISION_ENTITY_LABELS.length)
    expect(DEFAULT_VISION_ENTITY_LABELS.length).toBeLessThanOrEqual(100)
  })

  it('keeps only thresholded top labels and de-duplicates label ids', () => {
    expect(selectVisionEntityLabels([
      { label: labels[0]!, similarity: 0.3 },
      { label: labels[0]!, similarity: 0.5 },
      { label: labels[1]!, similarity: 0.19 },
      { label: labels[2]!, similarity: 0.4 }
    ], 0.2, 2).map((item) => [item.label.id, item.similarity])).toEqual([['person', 0.5], ['night', 0.4]])
  })

  it('keeps low-but-useful normalized SigLIP2 matches at the default threshold', () => {
    expect(selectVisionEntityLabels([{ label: labels[0]!, similarity: 0.06 }])).toEqual([{ label: labels[0], similarity: 0.06 }])
  })

  it('creates stable source ranges and explainable entity labels', () => {
    const evidence = createVisionEntityEvidence({
      sourceId: 'source-1',
      videoPath: '/media/demo.mp4',
      fileName: 'demo.mp4',
      sourceFingerprint: '/media/demo.mp4:10:20',
      frameId: 'frame-1',
      thumbnailPath: '/thumb/1.jpg',
      timestampSeconds: 5,
      intervalSeconds: 3,
      scores: [{ label: labels[0]!, similarity: 0.7 }],
      generatedAt: 123
    })

    expect(evidence).toHaveLength(1)
    expect(evidence[0]).toMatchObject({ evidenceType: 'entity', startSeconds: 3.5, endSeconds: 6.5, text: '人物 / person', frameId: 'frame-1', modelId: 'siglip2-zero-shot-labels', generatedAt: 123 })
  })

  it('does not create entity rows when the frame interval is invalid', () => {
    expect(createVisionEntityEvidence({
      sourceId: 'source-1', videoPath: '/media/demo.mp4', fileName: 'demo.mp4', sourceFingerprint: 'fingerprint', frameId: '', thumbnailPath: '', timestampSeconds: 1, intervalSeconds: 0, scores: [{ label: labels[0]!, similarity: 0.9 }]
    })).toEqual([])
  })
})
