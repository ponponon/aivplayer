import { describe, expect, it } from 'vitest'
import { summarizeVisionObjectDetectionCandidates } from '../../src/core/ai/vision-object-detection-summary'

describe('vision object detection summary', () => {
  it('groups labels case-insensitively and counts candidates', () => {
    expect(summarizeVisionObjectDetectionCandidates([
      { label: 'Person', score: 0.8, box: { xmin: 1, ymin: 1, xmax: 10, ymax: 10 } },
      { label: 'person', score: 0.9, box: { xmin: 11, ymin: 1, xmax: 20, ymax: 10 } },
      { label: 'chair', score: 0.95, box: { xmin: 21, ymin: 1, xmax: 30, ymax: 10 } }
    ])).toEqual([
      { label: 'Person', count: 2, maxScore: 0.9 },
      { label: 'chair', count: 1, maxScore: 0.95 }
    ])
  })

  it('sorts by count, then score, then label and ignores blank labels', () => {
    expect(summarizeVisionObjectDetectionCandidates([
      { label: 'zebra', score: 0.8, box: { xmin: 1, ymin: 1, xmax: 2, ymax: 2 } },
      { label: 'apple', score: 0.9, box: { xmin: 3, ymin: 1, xmax: 4, ymax: 2 } },
      { label: ' ', score: 1, box: { xmin: 5, ymin: 1, xmax: 6, ymax: 2 } }
    ]).map((item) => item.label)).toEqual(['apple', 'zebra'])
  })

  it('does not mutate the input detections', () => {
    const detections = [{ label: 'person', score: 0.8, box: { xmin: 1, ymin: 1, xmax: 2, ymax: 2 } }]
    const original = JSON.stringify(detections)
    summarizeVisionObjectDetectionCandidates(detections)
    expect(JSON.stringify(detections)).toBe(original)
  })
})
