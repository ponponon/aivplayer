import { describe, expect, it } from 'vitest'
import { renderVisionSearchResultsExport } from '../../src/core/ai/vision-search-export'
import type { VisionSearchResult } from '../../src/shared/vision-types'

const result: VisionSearchResult = {
  id: 'object-1',
  videoPath: '/media/海边, take.mp4',
  fileName: '海边, take.mp4',
  timestampSeconds: 12.5,
  thumbnailPath: '/thumb/object-1.jpg',
  score: 0.91,
  matchedText: 'person, "near" the sea',
  matchSource: 'subtitle',
  evidenceId: 'object-1',
  frameId: 'frame-1',
  sourceId: 'source-1',
  startSeconds: 12,
  endSeconds: 15,
  evidenceType: 'object',
  confidence: 0.88,
  box: { xmin: 1, ymin: 2, xmax: 30, ymax: 40 },
  sourceFingerprint: 'fingerprint-1',
  modelId: 'detector',
  modelVariant: 'test'
}

describe('vision search result export', () => {
  it('renders a versioned JSON manifest without changing result fields', () => {
    const output = renderVisionSearchResultsExport([result], 'json')
    expect(JSON.parse(output)).toEqual({ exportVersion: 1, results: [result] })
  })

  it('renders escaped CSV columns including evidence and object box fields', () => {
    const output = renderVisionSearchResultsExport([{ ...result, matchedText: '=unsafe, "text"' }], 'csv')
    expect(output.split('\n')[0]).toContain('evidence_id,evidence_type')
    expect(output).toContain('"\'=unsafe, ""text"""')
    expect(output).toContain('"/media/海边, take.mp4"')
    expect(output).toContain(',1,2,30,40,')
  })

  it('exports an empty result set with a stable header', () => {
    const output = renderVisionSearchResultsExport([], 'csv')
    expect(output.trim().split('\n')).toHaveLength(1)
    expect(output).toContain('index,evidence_id,evidence_type')
  })
})
