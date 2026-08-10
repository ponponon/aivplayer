import { describe, expect, it } from 'vitest'
import { aggregateVisionEvidenceSources, createEmptyVisionEvidenceCounts, normalizeVisionDerivedEvidenceTypes, normalizeVisionEvidenceClearTargets } from '../../src/core/ai/vision-evidence-sources'

describe('vision evidence sources', () => {
  it('aggregates derived evidence by source fingerprint and type', () => {
    const sources = aggregateVisionEvidenceSources([
      { videoPath: '/media/two.mp4', fileName: 'two.mp4', evidenceType: 'entity', sourceFingerprint: 'two-v1', generatedAt: 20 },
      { videoPath: '/media/one.mp4', fileName: 'one.mp4', evidenceType: 'speaker', sourceFingerprint: 'one-v1', generatedAt: 30 },
      { videoPath: '/media/one.mp4', fileName: 'one.mp4', evidenceType: 'ocr', sourceFingerprint: 'one-v1', generatedAt: 40 },
      { videoPath: '/media/one.mp4', fileName: 'one.mp4', evidenceType: 'speaker', sourceFingerprint: 'one-old', generatedAt: 50 },
      { videoPath: '/media/base.mp4', fileName: 'base.mp4', evidenceType: 'visual', sourceFingerprint: 'base-v1', generatedAt: 60 }
    ])

    expect(sources).toEqual([
      { videoPath: '/media/one.mp4', fileName: 'one.mp4', sourceFingerprint: 'one-old', evidenceCounts: { ocr: 0, scene: 0, entity: 0, speaker: 1 }, generatedAt: 50 },
      { videoPath: '/media/one.mp4', fileName: 'one.mp4', sourceFingerprint: 'one-v1', evidenceCounts: { ocr: 1, scene: 0, entity: 0, speaker: 1 }, generatedAt: 40 },
      { videoPath: '/media/two.mp4', fileName: 'two.mp4', sourceFingerprint: 'two-v1', evidenceCounts: { ocr: 0, scene: 0, entity: 1, speaker: 0 }, generatedAt: 20 }
    ])
    expect(aggregateVisionEvidenceSources(sources.flatMap((source) => Object.entries(source.evidenceCounts).flatMap(([evidenceType, count]) => Array.from({ length: count }, () => ({ videoPath: source.videoPath, fileName: source.fileName, evidenceType, sourceFingerprint: source.sourceFingerprint, generatedAt: source.generatedAt })))), ['ocr'])).toHaveLength(1)
  })

  it('normalizes clear targets and rejects base evidence types', () => {
    expect(normalizeVisionDerivedEvidenceTypes(['speaker', 'visual', 'speaker'])).toEqual(['speaker'])
    expect(normalizeVisionDerivedEvidenceTypes(undefined, true)).toEqual(['ocr', 'scene', 'entity', 'speaker'])
    expect(normalizeVisionEvidenceClearTargets([
      { videoPath: ' /media/one.mp4 ', evidenceTypes: ['speaker', 'entity'] },
      { videoPath: '/media/one.mp4', evidenceTypes: ['ocr', 'visual'] },
      { videoPath: '', evidenceTypes: ['scene'] }
    ])).toEqual([{ videoPath: '/media/one.mp4', evidenceTypes: ['ocr', 'entity', 'speaker'] }])
    expect(createEmptyVisionEvidenceCounts()).toEqual({ ocr: 0, scene: 0, entity: 0, speaker: 0 })
  })
})
