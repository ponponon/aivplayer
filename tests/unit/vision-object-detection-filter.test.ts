import { describe, expect, it } from 'vitest'
import { filterVisionObjectDetectionCandidates, normalizeVisionObjectDetectionFilterState, toggleVisionObjectDetectionCategoryFilter } from '../../src/core/ai/vision-object-detection-filter'

const detections = [
  { label: 'Person', score: 0.92, box: { xmin: 1, ymin: 1, xmax: 20, ymax: 20 } },
  { label: 'chair', score: 0.61, box: { xmin: 21, ymin: 1, xmax: 40, ymax: 20 } },
  { label: 'PERSON backpack', score: 0.74, box: { xmin: 41, ymin: 1, xmax: 60, ymax: 20 } }
] as const

describe('vision object detection filter', () => {
  it('matches labels case-insensitively while preserving result order', () => {
    expect(filterVisionObjectDetectionCandidates(detections, { labelQuery: ' person ' }).map((item) => item.label)).toEqual(['Person', 'PERSON backpack'])
  })

  it('filters candidates below the minimum score', () => {
    expect(filterVisionObjectDetectionCandidates(detections, { minimumScore: 0.75 }).map((item) => item.label)).toEqual(['Person'])
  })

  it('combines label and score filters without mutating the input', () => {
    const original = [...detections]
    expect(filterVisionObjectDetectionCandidates(detections, { labelQuery: 'person', minimumScore: 0.7 }).map((item) => item.label)).toEqual(['Person', 'PERSON backpack'])
    expect(detections).toEqual(original)
  })

  it('clamps invalid score filters to the supported range', () => {
    expect(filterVisionObjectDetectionCandidates(detections, { minimumScore: 2 })).toEqual([])
    expect(filterVisionObjectDetectionCandidates(detections, { minimumScore: -1 })).toHaveLength(3)
  })

  it('combines exact category OR filtering with the text and score filters', () => {
    expect(filterVisionObjectDetectionCandidates(detections, { categoryLabels: ['person', 'CHAIR'], minimumScore: 0.5 }).map((item) => item.label)).toEqual(['Person', 'chair'])
    expect(filterVisionObjectDetectionCandidates(detections, { labelQuery: 'back', categoryLabels: ['person backpack'], minimumScore: 0.7 }).map((item) => item.label)).toEqual(['PERSON backpack'])
  })

  it('toggles category labels without duplicating case variants', () => {
    expect(toggleVisionObjectDetectionCategoryFilter([], 'Person')).toEqual(['Person'])
    expect(toggleVisionObjectDetectionCategoryFilter(['Person'], ' person ')).toEqual([])
    expect(toggleVisionObjectDetectionCategoryFilter(['Person'], 'chair')).toEqual(['Person', 'chair'])
  })

  it('normalizes IPC filters and omits the default state', () => {
    expect(normalizeVisionObjectDetectionFilterState({ labelQuery: '  person ', minimumScore: 2, categoryLabels: ['Person', 'person', ' chair '] })).toEqual({ labelQuery: 'person', minimumScore: 1, categoryLabels: ['Person', 'chair'] })
    expect(normalizeVisionObjectDetectionFilterState({ labelQuery: '', minimumScore: 0, categoryLabels: [] })).toBeUndefined()
  })
})
