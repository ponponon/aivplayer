import { describe, expect, it } from 'vitest'
import { applySpeakerDiarizationCatalogToResults, createDefaultSpeakerDiarizationCatalog, getDefaultSpeakerName, getSpeakerDiarizationCatalogSearchQueries, updateSpeakerDiarizationCatalog } from '../../src/core/ai/speaker-diarization-catalog'
import type { VisionSearchResult } from '../../src/shared/vision-types'

function speakerResult(patch: Partial<VisionSearchResult> = {}): VisionSearchResult {
  return {
    id: 'speaker-evidence-1',
    videoPath: '/videos/demo.mp4',
    fileName: 'demo.mp4',
    timestampSeconds: 2,
    thumbnailPath: '',
    score: 0.8,
    matchedText: '说话人 1 / Speaker 1',
    evidenceType: 'speaker',
    sourceFingerprint: 'demo:100:200',
    modelId: 'sherpa-onnx-speaker-diarization',
    modelVariant: '1.13.4',
    ...patch
  }
}

describe('speaker diarization catalog', () => {
  it('keeps labels isolated by source fingerprint and projects them to search results', () => {
    let catalog = createDefaultSpeakerDiarizationCatalog(1)
    catalog = updateSpeakerDiarizationCatalog(catalog, {
      sourceFingerprint: 'demo:100:200',
      videoPath: '/videos/demo.mp4',
      fileName: 'demo.mp4',
      speakerId: 0,
      name: '张老师',
      aliases: ['张老师', '主讲人']
    }, 2)
    catalog = updateSpeakerDiarizationCatalog(catalog, {
      sourceFingerprint: 'other:100:200',
      videoPath: '/videos/other.mp4',
      fileName: 'other.mp4',
      speakerId: 0,
      name: '另一位说话人'
    }, 3)

    expect(getDefaultSpeakerName(0)).toBe('说话人 1 / Speaker 1')
    expect(applySpeakerDiarizationCatalogToResults([speakerResult()], catalog)[0]?.matchedText).toBe('张老师')
    expect(applySpeakerDiarizationCatalogToResults([speakerResult({ sourceFingerprint: 'missing' })], catalog)[0]?.matchedText).toBe('说话人 1 / Speaker 1')
    expect(getSpeakerDiarizationCatalogSearchQueries('主讲人', catalog)).toEqual(['说话人 1 / Speaker 1'])
  })

  it('rejects duplicate labels within one source without changing the catalog', () => {
    let catalog = createDefaultSpeakerDiarizationCatalog(1)
    catalog = updateSpeakerDiarizationCatalog(catalog, { sourceFingerprint: 'demo', videoPath: '/videos/demo.mp4', fileName: 'demo.mp4', speakerId: 0, name: '甲' }, 2)
    const unchanged = updateSpeakerDiarizationCatalog(catalog, { sourceFingerprint: 'demo', videoPath: '/videos/demo.mp4', fileName: 'demo.mp4', speakerId: 1, name: '甲' }, 3)
    expect(unchanged).toEqual(catalog)
  })
})
